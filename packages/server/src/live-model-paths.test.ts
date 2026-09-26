import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PROBLEM_TYPES } from "contracts/http/error"
import { unusedAiFixture } from "./ai/ai.fixtures"
import { buildApp } from "./app"
import { makeCurrentModelPaths } from "./config/config.current"
import { makeLoadModelOverrides, makeSaveModelOverrides } from "./config/config.yaml.adapters"
import { makeModelDownloads } from "./models/models.downloads"
import { modelDownloadKeys } from "./models/models.models"
import { modelDownloadPins, ModelDownloadPins } from "./models/models.pins"
import { assembleModelsSlice } from "./models/models.assembly"
import { makeReadReadiness } from "./readiness/readiness.read.usecase"
import { ok } from "./shared/result"
import { makeSongsSliceFixture } from "./songs/songs.fixtures"
import { unusedVisualizationsFixture } from "./visualizations/visualizations.fixtures"

const statusFixture = {
  version: "0.1.0",
  state: "online" as const,
  ffmpeg: "ok" as const,
  yue2: "ok" as const,
  sheetsage2: "ok" as const,
  queueDepth: 0,
  gpuBusy: false,
  startedAt: "2026-09-24T00:00:00.000Z",
}

const smallPins: ModelDownloadPins = Object.fromEntries(
  modelDownloadKeys.map((key) => [key, { ...modelDownloadPins[key], totalBytes: 5 }]),
) as ModelDownloadPins

/**
 * The whole point of the live resolver: a model path saved through
 * `PUT /v1/config` is what the very next readiness read and generation gate
 * see, with no process restart.
 */
test("a saved model path is live for the next readiness read and generation gate", async () => {
  const home = await mkdtemp(join(tmpdir(), "yuekbox-live-paths-test-"))
  try {
    const configFilePath = join(home, "config.yaml")
    const readModelPaths = makeCurrentModelPaths({
      home,
      flags: {},
      loadModelOverrides: makeLoadModelOverrides(configFilePath),
    })

    const yue2Dir = join(home, "elsewhere", "YuE2-3B")
    const vaeDir = join(home, "elsewhere", "YuE2-Vae")
    const measureModelSize = async (path: string): Promise<number | null> =>
      path === yue2Dir || path === vaeDir ? 7 : null

    const app = buildApp({
      songs: makeSongsSliceFixture(),
      wake: () => {},
      referenceMaxBytes: 1024,
      ai: unusedAiFixture(),
      visualizations: unusedVisualizationsFixture(),
      readiness: makeReadReadiness({
        readModelPaths,
        measureModelSize,
        expectedModelSizes: { yue2: 1, yue2Vae: 1, sheetsage2: 1, sheetsage2Base: 1, whisper: 1 },
        checkFfmpeg: async () => true,
        readGpuFacts: async () => ({ kind: "nvidia", driverVersion: "616.56" }),
      }),
      models: assembleModelsSlice({ home, readModelPaths }),
      status: async () => statusFixture,
      config: { home, configFilePath, flags: {} },
    })

    // Before the write the home defaults are missing, so freeform generation is blocked.
    const before = await app.inject({ method: "GET", url: "/v1/readiness" })
    expect(before.json().models.yue2.state).toBe("missing")
    const blocked = await app.inject({
      method: "POST",
      url: "/v1/songs",
      payload: { lyrics: "hello", style: "pop" },
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().type).toBe(PROBLEM_TYPES.modelRequired)
    expect(blocked.json().models.map((model: { key: string }) => model.key)).toEqual([
      "yue2",
      "yue2Vae",
    ])

    // The user points the two generator models at existing copies.
    await mkdir(yue2Dir, { recursive: true })
    await mkdir(vaeDir, { recursive: true })
    const saved = await app.inject({
      method: "PUT",
      url: "/v1/config",
      payload: { models: { yue2: yue2Dir, yue2Vae: vaeDir } },
    })
    expect(saved.statusCode).toBe(200)

    // No restart: the next readiness read and gate call both use the new paths.
    const after = await app.inject({ method: "GET", url: "/v1/readiness" })
    expect(after.json().models.yue2).toEqual({ state: "ready", path: yue2Dir, size: 7 })
    const created = await app.inject({
      method: "POST",
      url: "/v1/songs",
      payload: { lyrics: "hello", style: "pop" },
    })
    expect(created.statusCode).toBe(201)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test("a saved path is the target of the next download attempt", async () => {
  const home = await mkdtemp(join(tmpdir(), "yuekbox-live-download-test-"))
  try {
    const configFilePath = join(home, "config.yaml")
    const readModelPaths = makeCurrentModelPaths({
      home,
      flags: {},
      loadModelOverrides: makeLoadModelOverrides(configFilePath),
    })
    const target = join(home, "models", "custom-YuE2-Vae")
    await makeSaveModelOverrides(configFilePath)({ yue2Vae: target })

    const moves: Array<readonly [string, string]> = []
    const downloads = makeModelDownloads({
      home,
      readModelPaths,
      pins: smallPins,
      readModelTree: async () => ok([{ path: "weights.bin", sizeBytes: 5, sha256: null }]),
      downloadFile: async (request) => {
        request.onBytes(request.expectedBytes)
        return ok(request.expectedBytes)
      },
      pathExists: async () => false,
      ensureDirectory: async () => {},
      moveDirectory: async (from, to) => {
        moves.push(Object.freeze([from, to]))
      },
      removeDirectory: async () => {},
      measureFileBytes: async () => null,
    })

    const result = await downloads.start({ key: "yue2Vae", confirm: true })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.path).toBe(target)
    await downloads.drain()
    expect(moves).toEqual([[`${home}/models/.downloads/yue2Vae`, target]])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
