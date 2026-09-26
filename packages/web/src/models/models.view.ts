import {
  MissingModel,
  ModelDownloads,
  ModelDownloadSnapshot,
  ModelKey,
} from "contracts/http/models"
import { Readiness, SystemReadiness } from "contracts/http/readiness"
import { catalogEntryFor, modelCatalogOrder } from "./models.catalog"

export const downloadPollMs = 1000

const snapshotFor = (
  downloads: ModelDownloads | undefined,
  key: ModelKey,
): ModelDownloadSnapshot | undefined => downloads?.find((item) => item.key === key)

const isActiveDownload = (snapshot: ModelDownloadSnapshot): boolean =>
  snapshot.state === "preparing" || snapshot.state === "downloading"

/** True while at least one model is still arriving; the poll stops after. */
export const hasActiveDownload = (downloads: ModelDownloads | undefined): boolean =>
  downloads !== undefined && downloads.some(isActiveDownload)

/** The keys currently arriving, in report order. Drives the readiness refresh. */
export const activeDownloadKeys = (downloads: ModelDownloads | undefined): readonly ModelKey[] =>
  downloads === undefined ? [] : downloads.filter(isActiveDownload).map((item) => item.key)

/**
 * A floored, clamped percent once files are moving; null while the server is
 * still listing the repository or the total is unknown, so the row can say
 * "starting…" instead of pretending the bar moved.
 */
export const downloadPercent = (snapshot: ModelDownloadSnapshot | undefined): number | null => {
  if (snapshot === undefined || snapshot.state !== "downloading") return null
  if (snapshot.totalBytes <= 0) return null
  return Math.max(0, Math.min(100, Math.floor((snapshot.bytesDone / snapshot.totalBytes) * 100)))
}

const byteUnits = ["B", "KB", "MB", "GB", "TB"] as const

/** A floored byte count in the largest unit that keeps it human. */
export const formatBytes = (bytes: number): string => {
  const nonNegative = Math.max(0, bytes)
  if (nonNegative === 0) return "0 B"
  const exponent = Math.min(
    Math.floor(Math.log2(nonNegative) / Math.log2(1024)),
    byteUnits.length - 1,
  )
  const size = nonNegative / 1024 ** exponent
  const unit = byteUnits[exponent] ?? "B"
  const rounded =
    exponent === 0 ? Math.round(size).toString() : (Math.round(size * 10) / 10).toString()
  return `${rounded} ${unit}`
}

/** One row of the models panel or the blocked-generation prompt. */
export type ModelRowView = Readonly<{
  key: ModelKey
  name: string
  job: string
  state: "ready" | "missing"
  path: string
  sizeBytes: number
  active: boolean
  percent: number | null
  currentFile: string | null
  downloadError: string | null
}>
/**
 * The five rows, always in report order. State and path come from readiness;
 * `size` is bytes on disk when ready and the expected download when missing.
 */
export const modelRowViews = (
  readiness: Readiness | undefined,
  downloads: ModelDownloads | undefined,
): readonly ModelRowView[] =>
  modelCatalogOrder.map((key) => {
    const entry = catalogEntryFor(key)
    const model = readiness?.models[key]
    const snapshot = snapshotFor(downloads, key)
    return {
      key,
      name: entry.name,
      job: entry.job,
      state: model?.state ?? "missing",
      path: model?.path ?? "",
      sizeBytes: model?.size ?? snapshot?.totalBytes ?? 0,
      active: snapshot !== undefined && isActiveDownload(snapshot),
      percent: downloadPercent(snapshot),
      currentFile: snapshot?.currentFile ?? null,
      downloadError: snapshot?.state === "failed" ? (snapshot.errorDetail ?? null) : null,
    }
  })

/** A machine prerequisite that is missing, with its copy-paste fixes. */
export type SystemIssue = Readonly<{
  id: "ffmpeg" | "nvidia"
  message: string
  fix: Readonly<{ linux: string; wsl2: string }>
}>

/** The failed half of the system preflight, in report order. Informational only. */
export const systemIssues = (system: SystemReadiness | undefined): readonly SystemIssue[] => {
  if (system === undefined) return []
  const checks = [
    { id: "ffmpeg" as const, check: system.ffmpeg },
    { id: "nvidia" as const, check: system.nvidia },
  ]
  return checks.flatMap(({ id, check }) =>
    check.state === "missing"
      ? [{ id, message: check.message, fix: { linux: check.fix.linux, wsl2: check.fix.wsl2 } }]
      : [],
  )
}

/** The display name for one model, from the total catalog. */
const nameFor = (key: ModelKey): string => catalogEntryFor(key).name

/** The infinitive the blocked-generation prompt uses for one model. */
export const needFor = (key: ModelKey): string => catalogEntryFor(key).need

const singleModel = <T>(models: readonly T[]): T | null =>
  models.length === 1 ? (models[0] ?? null) : null

/** The blocked-generation prompt's heading. */
export const blockedTitle = (models: readonly MissingModel[]): string => {
  const model = singleModel(models)
  if (model === null) return `${models.length} models are missing`
  return `${nameFor(model.key)} is missing`
}

/** The same heading once every model in the prompt landed. */
export const modelsReadyTitle = (models: readonly MissingModel[]): string => {
  const model = singleModel(models)
  if (model === null) return "All models are ready"
  return `${nameFor(model.key)} is ready`
}

/** The blocked-generation prompt's one plain sentence. */
export const blockedDetail = (models: readonly MissingModel[]): string => {
  const model = singleModel(models)
  if (model === null) return "yuekbox needs them before it can start this song."
  return `yuekbox needs it to ${needFor(model.key)}.`
}
