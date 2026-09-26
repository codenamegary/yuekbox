import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigSchema, ModelPathOverrides } from "contracts/http/config"
import { PROBLEM_TYPES } from "contracts/http/error"
import { unusedAiFixture } from "../ai/ai.fixtures"
import { buildApp } from "../app"
import { unusedModelsFixture } from "../models/models.fixtures"
import { unusedReadinessFixture } from "../readiness/readiness.fixtures"
import { makeSongsSliceFixture } from "../songs/songs.fixtures"
import { unusedVisualizationsFixture } from "../visualizations/visualizations.fixtures"

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

const makeApp = (input: {
  home: string
  configPath: string
  flags?: ModelPathOverrides
}): ReturnType<typeof buildApp> =>
  buildApp({
    songs: makeSongsSliceFixture(),
    wake: () => {},
    referenceMaxBytes: 1024,
    ai: unusedAiFixture(),
    visualizations: unusedVisualizationsFixture(),
    readiness: unusedReadinessFixture(),
    models: unusedModelsFixture(),
    status: async () => statusFixture,
    config: {
      home: input.home,
      configFilePath: input.configPath,
      flags: input.flags ?? {},
    },
  })

const withHome = async (
  run: (input: { home: string; configPath: string }) => Promise<void>,
): Promise<void> => {
  const home = await mkdtemp(join(tmpdir(), "yuekbox-config-routes-test-"))
  try {
    await run({ home, configPath: join(home, "config.yaml") })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

test("GET returns the home defaults when no config file exists", async () => {
  await withHome(async ({ home, configPath }) => {
    const app = makeApp({ home, configPath })

    const response = await app.inject({ method: "GET", url: "/v1/config" })

    expect(response.statusCode).toBe(200)
    expect(ConfigSchema.parse(response.json()).models).toEqual({
      yue2: join(home, "models", "YuE2-3B"),
      yue2Vae: join(home, "models", "YuE2-Vae"),
      sheetsage2: join(home, "models", "SheetSage2"),
      sheetsage2Base: join(home, "models", "MERT-v2-FullSong"),
      whisper: join(home, "models", "whisper-large-v3-turbo"),
    })
  })
})

test("GET honors config.yaml values", async () => {
  await withHome(async ({ home, configPath }) => {
    await Bun.write(configPath, "models:\n  yue2: /mnt/models/YuE2-3B\n")
    const app = makeApp({ home, configPath })

    const response = await app.inject({ method: "GET", url: "/v1/config" })

    expect(response.statusCode).toBe(200)
    expect(response.json().models.yue2).toBe("/mnt/models/YuE2-3B")
    expect(response.json().models.sheetsage2).toBe(join(home, "models", "SheetSage2"))
  })
})

test("GET honors a config.yaml pointing at an existing directory", async () => {
  await withHome(async ({ home, configPath }) => {
    const modelsDir = join(home, "elsewhere", "YuE2-3B")
    await mkdir(modelsDir, { recursive: true })
    await Bun.write(configPath, `models:\n  yue2: ${modelsDir}\n`)
    const app = makeApp({ home, configPath })

    const response = await app.inject({ method: "GET", url: "/v1/config" })

    expect(response.statusCode).toBe(200)
    expect(response.json().models.yue2).toBe(modelsDir)
  })
})

test("GET lets a CLI flag beat config.yaml", async () => {
  await withHome(async ({ home, configPath }) => {
    await Bun.write(configPath, "models:\n  yue2: /mnt/config/YuE2-3B\n")
    const app = makeApp({ home, configPath, flags: { yue2: "/mnt/flag/YuE2-3B" } })

    const response = await app.inject({ method: "GET", url: "/v1/config" })

    expect(response.json().models.yue2).toBe("/mnt/flag/YuE2-3B")
  })
})

test("PUT writes a partial update and returns the effective config", async () => {
  await withHome(async ({ home, configPath }) => {
    const app = makeApp({ home, configPath })

    const response = await app.inject({
      method: "PUT",
      url: "/v1/config",
      payload: { models: { sheetsage2: "/mnt/models/SheetSage2" } },
    })

    expect(response.statusCode).toBe(200)
    expect(ConfigSchema.parse(response.json()).models.sheetsage2).toBe("/mnt/models/SheetSage2")
    expect(existsSync(`${configPath}.tmp`)).toBe(false)
    expect(await Bun.YAML.parse(await readFile(configPath, "utf8"))).toEqual({
      models: { sheetsage2: "/mnt/models/SheetSage2" },
    })
  })
})

test("PUT merges with stored keys and a later GET sees them", async () => {
  await withHome(async ({ home, configPath }) => {
    await Bun.write(configPath, "models:\n  yue2: /mnt/config/YuE2-3B\n")
    const app = makeApp({ home, configPath })

    const response = await app.inject({
      method: "PUT",
      url: "/v1/config",
      payload: { models: { whisper: "/mnt/models/whisper" } },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().models.yue2).toBe("/mnt/config/YuE2-3B")
    expect(response.json().models.whisper).toBe("/mnt/models/whisper")

    const fetched = await app.inject({ method: "GET", url: "/v1/config" })
    expect(fetched.json().models).toEqual(response.json().models)
  })
})

test("PUT refuses to save a path a CLI flag pins, naming the flag", async () => {
  await withHome(async ({ home, configPath }) => {
    const app = makeApp({ home, configPath, flags: { whisper: "/mnt/flag/whisper" } })

    const response = await app.inject({
      method: "PUT",
      url: "/v1/config",
      payload: { models: { whisper: "/mnt/user/whisper" } },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().type).toBe(PROBLEM_TYPES.conflict)
    expect(response.json().detail).toContain("--whisper")
    expect(existsSync(configPath)).toBe(false)
  })
})

test("PUT keeps saving the models a CLI flag does not pin", async () => {
  await withHome(async ({ home, configPath }) => {
    const app = makeApp({ home, configPath, flags: { whisper: "/mnt/flag/whisper" } })

    const response = await app.inject({
      method: "PUT",
      url: "/v1/config",
      payload: { models: { yue2: "/mnt/user/YuE2-3B" } },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().models.yue2).toBe("/mnt/user/YuE2-3B")
    expect(response.json().models.whisper).toBe("/mnt/flag/whisper")
  })
})

test("PUT accepts null to reset a stored path to its default", async () => {
  await withHome(async ({ home, configPath }) => {
    await Bun.write(configPath, "models:\n  yue2: /mnt/config/YuE2-3B\n")
    const app = makeApp({ home, configPath })

    const response = await app.inject({
      method: "PUT",
      url: "/v1/config",
      payload: { models: { yue2: null } },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().models.yue2).toBe(join(home, "models", "YuE2-3B"))
    expect(await Bun.YAML.parse(await readFile(configPath, "utf8"))).toEqual({ models: {} })
  })
})

test("PUT rejects an unknown model key with a validation problem", async () => {
  await withHome(async ({ home, configPath }) => {
    const app = makeApp({ home, configPath })

    const response = await app.inject({
      method: "PUT",
      url: "/v1/config",
      payload: { models: { yue1: "/mnt/x" } },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().type).toBe(PROBLEM_TYPES.validationError)
    expect(existsSync(configPath)).toBe(false)
  })
})

test("PUT rejects a non-string path with a validation problem", async () => {
  await withHome(async ({ home, configPath }) => {
    const app = makeApp({ home, configPath })

    const response = await app.inject({
      method: "PUT",
      url: "/v1/config",
      payload: { models: { yue2: 42 } },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().type).toBe(PROBLEM_TYPES.validationError)
  })
})

test("an empty PUT changes nothing on disk", async () => {
  await withHome(async ({ home, configPath }) => {
    const app = makeApp({ home, configPath })

    const response = await app.inject({ method: "PUT", url: "/v1/config", payload: { models: {} } })

    expect(response.statusCode).toBe(200)
    expect(existsSync(configPath)).toBe(false)
  })
})
