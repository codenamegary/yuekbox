import { dirname, join } from "node:path"
import { ModelPaths } from "contracts/http/config"
import { ReadCurrentModelPaths } from "../config/config.current"
import { describeError } from "../shared/describe"
import { err, ok, Result } from "../shared/result"
import {
  downloadConfirmationThresholdBytes,
  ModelDownloadFailure,
  ModelDownloadKey,
  ModelDownloadSnapshot,
  modelDownloadKeys,
  ModelTreeFile,
  StartModelDownloadError,
} from "./models.models"
import { downloadTempDir, isInsideModelsDir } from "./models.paths"
import { downloadFailureMessage } from "./models.messages"
import { modelDownloadPins, ModelDownloadPin, ModelDownloadPins } from "./models.pins"
import {
  DownloadModelFile,
  EnsureDirectory,
  MeasureFileBytes,
  MoveDirectory,
  PathExists,
  ReadModelTree,
  RemoveDirectory,
} from "./models.ports"
import { modelFileUrl } from "./models.tree"

export type ModelDownloadsDeps = Readonly<{
  home: string
  /** Resolved per request, so a path saved before the next attempt is honored. */
  readModelPaths: ReadCurrentModelPaths
  /** Test seam; the process root leaves it at the pinned manifest. */
  pins?: ModelDownloadPins
  /** Test seam; the process root leaves it at the shipped threshold. */
  confirmationThresholdBytes?: number
  readModelTree: ReadModelTree
  downloadFile: DownloadModelFile
  pathExists: PathExists
  ensureDirectory: EnsureDirectory
  moveDirectory: MoveDirectory
  removeDirectory: RemoveDirectory
  measureFileBytes: MeasureFileBytes
  logError?: (message: string, error: unknown) => void
}>

export type ModelDownloads = Readonly<{
  /** Starts, resumes, or reports an existing download. Idempotent per model. */
  start: (
    input: Readonly<{ key: ModelDownloadKey; confirm: boolean }>,
  ) => Promise<Result<ModelDownloadSnapshot, StartModelDownloadError>>
  read: (key: ModelDownloadKey) => Promise<ModelDownloadSnapshot>
  readAll: () => Promise<readonly ModelDownloadSnapshot[]>
  drain: () => Promise<void>
  /** Aborts every in-flight job, so shutdown never waits on a stalled fetch. */
  stop: () => void
}>

/** In-memory per-process job state; the staged files on disk are the durable part. */
type Job = {
  state: "preparing" | "downloading" | "failed"
  bytesDone: number
  currentFile: string | null
  errorDetail?: string
}

const presentSnapshot = (
  key: ModelDownloadKey,
  path: string,
  totalBytes: number,
): ModelDownloadSnapshot =>
  Object.freeze({
    key,
    state: "present",
    path,
    totalBytes,
    bytesDone: totalBytes,
    currentFile: null,
  })

const idleSnapshot = (
  key: ModelDownloadKey,
  path: string,
  totalBytes: number,
): ModelDownloadSnapshot =>
  Object.freeze({ key, state: "idle", path, totalBytes, bytesDone: 0, currentFile: null })

const jobSnapshot = (
  key: ModelDownloadKey,
  path: string,
  totalBytes: number,
  job: Job,
): ModelDownloadSnapshot =>
  Object.freeze({
    key,
    state: job.state,
    path,
    totalBytes,
    bytesDone: Math.min(job.bytesDone, totalBytes),
    currentFile: job.currentFile,
    ...(job.errorDetail !== undefined ? { errorDetail: job.errorDetail } : {}),
  })

/**
 * Downloads pinned Hugging Face snapshots into `<home>/models`, on explicit
 * request. Files stage under `<home>/models/.downloads/<key>` and the folder is
 * renamed into place only when every file is whole, so an interrupted run can
 * never leave a half model at the path generation uses.
 *
 * State lives in this process; a restart reports `idle` (or `present` when the
 * move finished) and a fresh start resumes from the staged files. A failed
 * attempt keeps its staged files and its failure detail until the next start.
 */
export const makeModelDownloads = (deps: ModelDownloadsDeps): ModelDownloads => {
  const pins = deps.pins ?? modelDownloadPins
  const threshold = deps.confirmationThresholdBytes ?? downloadConfirmationThresholdBytes
  const jobs = new Map<ModelDownloadKey, Job>()
  const tasks = new Map<ModelDownloadKey, Promise<void>>()
  const starts = new Map<ModelDownloadKey, Promise<unknown>>()
  const aborts = new Map<ModelDownloadKey, AbortController>()

  const snapshotFor = async (
    key: ModelDownloadKey,
    modelPaths: ModelPaths,
  ): Promise<ModelDownloadSnapshot> => {
    const pin = pins[key]
    const path = modelPaths[key]
    if (await deps.pathExists(path)) return presentSnapshot(key, path, pin.totalBytes)
    const job = jobs.get(key)
    return job === undefined
      ? idleSnapshot(key, path, pin.totalBytes)
      : jobSnapshot(key, path, pin.totalBytes, job)
  }

  const runJob = async (
    key: ModelDownloadKey,
    pin: ModelDownloadPin,
    target: string,
    signal: AbortSignal,
  ): Promise<void> => {
    const job = jobs.get(key)
    if (job === undefined) return
    const tempDir = downloadTempDir(deps.home, key)

    const fail = (failure: ModelDownloadFailure): void => {
      job.state = "failed"
      job.currentFile = null
      // The user sees the plain kind-level line; raw details (repository
      // URLs, checksums, HTTP codes) stay in the server log only.
      job.errorDetail = downloadFailureMessage(failure)
      deps.logError?.(`model download failed (${key}): ${failure.detail}`, failure)
    }

    const treeResult = await deps.readModelTree(pin.repo, pin.revision, signal)
    if (!treeResult.ok) {
      fail(treeResult.error)
      return
    }
    const tree: readonly ModelTreeFile[] = treeResult.value
    const total = tree.reduce((sum, file) => sum + file.sizeBytes, 0)
    if (total !== pin.totalBytes) {
      fail({
        kind: "manifest_mismatch",
        detail: `the pinned revision lists ${total} bytes, the manifest pins ${pin.totalBytes}`,
      })
      return
    }

    await deps.ensureDirectory(tempDir)
    let bytesDone = 0 // structure: allow-let
    const remaining: ModelTreeFile[] = []
    for (const file of tree) {
      const staged = await deps.measureFileBytes(join(tempDir, file.path))
      if (staged === file.sizeBytes) {
        bytesDone += staged
        continue
      }
      remaining.push(file)
    }
    job.state = "downloading"
    job.bytesDone = bytesDone

    for (const file of remaining) {
      const base = bytesDone
      job.currentFile = file.path
      const downloaded = await deps.downloadFile({
        url: modelFileUrl(pin.repo, pin.revision, file.path),
        destPath: join(tempDir, file.path),
        expectedBytes: file.sizeBytes,
        sha256: file.sha256,
        onBytes: (written) => {
          job.bytesDone = base + written
        },
        signal,
      })
      if (!downloaded.ok) {
        fail(downloaded.error)
        return
      }
      bytesDone += file.sizeBytes
      job.bytesDone = bytesDone
    }
    job.currentFile = null

    if (await deps.pathExists(target)) {
      await deps.removeDirectory(tempDir).catch((error: unknown) => {
        deps.logError?.("staged model cleanup failed", error)
      })
      jobs.delete(key)
      return
    }

    // A user-configured path inside the home may point under a nested folder.
    try {
      await deps.ensureDirectory(dirname(target))
      await deps.moveDirectory(tempDir, target)
    } catch (error: unknown) {
      if (await deps.pathExists(target)) {
        await deps.removeDirectory(tempDir).catch(() => undefined)
        jobs.delete(key)
        return
      }
      fail({ kind: "move_failed", detail: describeError(error) })
      return
    }
    jobs.delete(key)
  }

  const startOnce: ModelDownloads["start"] = async (input) => {
    const key = input.key
    const modelPaths = await deps.readModelPaths()
    const pin = pins[key]
    const target = modelPaths[key]

    const existing = jobs.get(key)
    if (existing !== undefined && existing.state !== "failed") {
      return ok(jobSnapshot(key, target, pin.totalBytes, existing))
    }
    jobs.delete(key)

    // The per-key start chain makes this claim exclusive; no other start
    // can hold the key while these checks run.
    const job: Job = { state: "preparing", bytesDone: 0, currentFile: null }
    jobs.set(key, job)
    const abort = new AbortController()
    aborts.set(key, abort)

    if (await deps.pathExists(target)) {
      jobs.delete(key)
      return ok(presentSnapshot(key, target, pin.totalBytes))
    }
    if (!isInsideModelsDir(deps.home, target)) {
      jobs.delete(key)
      return err({ kind: "path_outside_home", key, path: target })
    }
    if (!input.confirm && pin.totalBytes > threshold) {
      jobs.delete(key)
      return err({
        kind: "confirmation_required",
        key,
        expectedBytes: pin.totalBytes,
        thresholdBytes: threshold,
      })
    }

    const task = runJob(key, pin, target, abort.signal)
      .catch((error: unknown) => {
        const current = jobs.get(key)
        if (current !== undefined) {
          current.state = "failed"
          current.currentFile = null
          current.errorDetail = "the download failed unexpectedly"
        }
        deps.logError?.(`model download failed (${key})`, error)
      })
      .finally(() => {
        tasks.delete(key)
        aborts.delete(key)
      })
    tasks.set(key, task)

    return ok(jobSnapshot(key, target, pin.totalBytes, job))
  }

  const start: ModelDownloads["start"] = (input) => {
    // Starts are serialized per model. A start queued behind another waits
    // for the first to finish validating, so it never reports a job the
    // first start is about to drop, and its own confirmation check always
    // runs on fresh state.
    const previous = starts.get(input.key) ?? Promise.resolve()
    const next = previous.then(
      () => startOnce(input),
      () => startOnce(input),
    )
    starts.set(input.key, next)
    void next
      .catch(() => undefined)
      .finally(() => {
        if (starts.get(input.key) === next) starts.delete(input.key)
      })
    return next
  }

  return {
    start,
    read: async (key) => snapshotFor(key, await deps.readModelPaths()),
    readAll: async () => {
      const modelPaths = await deps.readModelPaths()
      return Object.freeze(
        await Promise.all(modelDownloadKeys.map((key) => snapshotFor(key, modelPaths))),
      )
    },
    drain: async () => {
      await Promise.allSettled(tasks.values())
    },
    stop: () => {
      for (const abort of aborts.values()) abort.abort()
    },
  }
}
