import { expect, test } from "bun:test"
import { ModelPaths } from "contracts/http/config"
import { ok, Result } from "../shared/result"
import { ModelDownloadFailure, ModelTreeFile, modelDownloadKeys } from "./models.models"
import { modelDownloadPins, ModelDownloadPins } from "./models.pins"
import { ModelFileDownloadRequest } from "./models.ports"
import { makeModelDownloads } from "./models.downloads"

const home = "/home/u/.yuekbox"

const modelPaths: ModelPaths = Object.freeze({
  yue2: `${home}/models/YuE2-3B`,
  yue2Vae: `${home}/models/YuE2-Vae`,
  sheetsage2: `${home}/models/SheetSage2`,
  sheetsage2Base: `${home}/models/MERT-v2-FullSong`,
  whisper: `${home}/models/whisper-large-v3-turbo`,
})

const smallPins: ModelDownloadPins = Object.fromEntries(
  modelDownloadKeys.map((key) => [key, { ...modelDownloadPins[key], totalBytes: 5 }]),
) as ModelDownloadPins

const treeFile = (path: string, sizeBytes: number, sha256: string | null = null): ModelTreeFile =>
  Object.freeze({ path, sizeBytes, sha256 })

type Calls = {
  tree: number
  files: string[]
  moves: Array<readonly [string, string]>
  removed: string[]
}

const makeCalls = (): Calls => ({ tree: 0, files: [], moves: [], removed: [] })

type Deps = Parameters<typeof makeModelDownloads>[0]
type Overrides = Partial<Deps> & Readonly<{ calls?: Calls }>

const smallTree: readonly ModelTreeFile[] = [treeFile("a.bin", 2), treeFile("b.bin", 3)]

const makeDeferred = () => {
  const box: { resolve: (value: Result<readonly ModelTreeFile[], ModelDownloadFailure>) => void } =
    {
      resolve: () => {},
    }
  const promise = new Promise<Result<readonly ModelTreeFile[], ModelDownloadFailure>>((resolve) => {
    box.resolve = resolve
  })
  return { promise, resolve: box.resolve }
}

const makeDeps = (overrides: Overrides = {}) => {
  const calls = overrides.calls ?? makeCalls()
  const deps: Deps = {
    home,
    modelPaths,
    pins: smallPins,
    readModelTree: async () => {
      calls.tree += 1
      return ok(smallTree)
    },
    downloadFile: async (request: ModelFileDownloadRequest) => {
      calls.files.push(request.destPath)
      request.onBytes(request.expectedBytes)
      return ok(request.expectedBytes)
    },
    pathExists: async () => false,
    ensureDirectory: async () => {},
    moveDirectory: async (from, to) => {
      calls.moves.push(Object.freeze([from, to]))
    },
    removeDirectory: async (path) => {
      calls.removed.push(path)
    },
    measureFileBytes: async () => null,
    confirmationThresholdBytes: 4,
    ...overrides,
  }
  return { deps, calls }
}

test("a download over the threshold is refused without an explicit confirmation", async () => {
  const { deps, calls } = makeDeps()
  const downloads = makeModelDownloads(deps)

  const result = await downloads.start({ key: "yue2", confirm: false })

  expect(result).toEqual({
    ok: false,
    error: {
      kind: "confirmation_required",
      key: "yue2",
      expectedBytes: 5,
      thresholdBytes: 4,
    },
  })
  expect(calls.tree).toBe(0)
})

test("a download under the threshold starts without a confirmation", async () => {
  const { deps } = makeDeps({ confirmationThresholdBytes: 10 })
  const downloads = makeModelDownloads(deps)

  const result = await downloads.start({ key: "yue2", confirm: false })

  expect(result.ok).toBe(true)
  await downloads.drain()
})

test("a resolved path outside the models folder is refused and never fetched", async () => {
  const { deps, calls } = makeDeps({
    modelPaths: { ...modelPaths, yue2: "/mnt/audio/YuE2-3B" },
  })
  const downloads = makeModelDownloads(deps)

  const result = await downloads.start({ key: "yue2", confirm: true })

  expect(result).toEqual({
    ok: false,
    error: { kind: "path_outside_home", key: "yue2", path: "/mnt/audio/YuE2-3B" },
  })
  expect(calls.tree).toBe(0)
})

test("a present model is a no-op even without a confirmation", async () => {
  const { deps, calls } = makeDeps({ pathExists: async (path) => path === modelPaths.yue2 })
  const downloads = makeModelDownloads(deps)

  const result = await downloads.start({ key: "yue2", confirm: false })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.state).toBe("present")
  expect(result.value.bytesDone).toBe(5)
  expect(calls.tree).toBe(0)
})

test("a confirmed start downloads every file and moves the staged folder into place", async () => {
  const { deps, calls } = makeDeps()
  let present = false
  const downloads = makeModelDownloads({
    ...deps,
    pathExists: async (path) => path === modelPaths.yue2 && present,
    moveDirectory: async (from, to) => {
      calls.moves.push(Object.freeze([from, to]))
      present = true
    },
  })

  const started = await downloads.start({ key: "yue2", confirm: true })
  expect(started.ok).toBe(true)
  if (!started.ok) return
  expect(["preparing", "downloading"]).toContain(started.value.state)

  await downloads.drain()

  expect(calls.files).toEqual([
    `${home}/models/.downloads/yue2/a.bin`,
    `${home}/models/.downloads/yue2/b.bin`,
  ])
  expect(calls.moves).toEqual([[`${home}/models/.downloads/yue2`, modelPaths.yue2]])
  const snapshot = await downloads.read("yue2")
  expect(snapshot.state).toBe("present")
  expect(snapshot.bytesDone).toBe(5)
  expect(snapshot.totalBytes).toBe(5)
})

test("a second start while a download runs reports the same job and adds no fetch", async () => {
  const deferred = makeDeferred()
  const { deps, calls } = makeDeps({
    readModelTree: async () => {
      calls.tree += 1
      return await deferred.promise
    },
  })
  const downloads = makeModelDownloads(deps)

  const first = await downloads.start({ key: "yue2", confirm: true })
  const second = await downloads.start({ key: "yue2", confirm: true })

  expect(first.ok && second.ok).toBe(true)
  if (!first.ok || !second.ok) return
  expect(second.value.state).toBe("preparing")
  expect(calls.tree).toBe(1)
  deferred.resolve(ok(smallTree))
  await downloads.drain()
})

test("a resumed download skips whole files already staged and counts their bytes", async () => {
  const { deps, calls } = makeDeps({
    measureFileBytes: async (path) => (path === `${home}/models/.downloads/yue2/a.bin` ? 2 : null),
  })
  const downloads = makeModelDownloads(deps)

  await downloads.start({ key: "yue2", confirm: true })
  await downloads.drain()

  expect(calls.files).toEqual([`${home}/models/.downloads/yue2/b.bin`])
})

test("a failed job remembers why and a new start retries it", async () => {
  const { deps, calls } = makeDeps({
    readModelTree: async () => {
      calls.tree += 1
      return calls.tree === 1
        ? { ok: false, error: { kind: "tree_fetch_failed", detail: "HTTP 503" } }
        : ok(smallTree)
    },
  })
  const downloads = makeModelDownloads(deps)

  await downloads.start({ key: "yue2", confirm: true })
  await downloads.drain()

  const failed = await downloads.read("yue2")
  expect(failed.state).toBe("failed")
  expect(failed.errorDetail).toContain("503")

  const retried = await downloads.start({ key: "yue2", confirm: true })
  expect(retried.ok).toBe(true)
  await downloads.drain()
  expect(calls.tree).toBe(2)
})

test("a pinned revision whose tree total does not match the pin fails loudly", async () => {
  const { deps } = makeDeps({
    readModelTree: async () => ok([treeFile("a.bin", 3), treeFile("b.bin", 3)]),
  })
  const downloads = makeModelDownloads(deps)

  await downloads.start({ key: "yue2", confirm: true })
  await downloads.drain()

  const snapshot = await downloads.read("yue2")
  expect(snapshot.state).toBe("failed")
  expect(snapshot.errorDetail).toContain("6")
})

test("reads all five models in report order and reports idle when nothing happened", async () => {
  const { deps } = makeDeps()
  const downloads = makeModelDownloads(deps)

  const snapshots = await downloads.readAll()

  expect(snapshots.map((snapshot) => snapshot.key)).toEqual([...modelDownloadKeys])
  for (const snapshot of snapshots) {
    expect(snapshot.state).toBe("idle")
    expect(snapshot.bytesDone).toBe(0)
    expect(snapshot.totalBytes).toBe(5)
  }
})
