import { expect, test } from "bun:test"
import { join } from "node:path"
import { ModelPathOverrides } from "contracts/http/config"
import { defaultModelPaths, resolveModelPaths } from "./config.resolve"

const home = "/home/user/.yuekbox"

const models = [
  {
    key: "yue2",
    directory: "YuE2-3B",
    override: (value: string): ModelPathOverrides => ({ yue2: value }),
  },
  {
    key: "yue2Vae",
    directory: "YuE2-Vae",
    override: (value: string): ModelPathOverrides => ({ yue2Vae: value }),
  },
  {
    key: "sheetsage2",
    directory: "SheetSage2",
    override: (value: string): ModelPathOverrides => ({ sheetsage2: value }),
  },
  {
    key: "sheetsage2Base",
    directory: "MERT-v2-FullSong",
    override: (value: string): ModelPathOverrides => ({ sheetsage2Base: value }),
  },
  {
    key: "whisper",
    directory: "whisper-large-v3-turbo",
    override: (value: string): ModelPathOverrides => ({ whisper: value }),
  },
] as const

for (const model of models) {
  test(`models.${model.key} defaults under <home>/models`, () => {
    expect(defaultModelPaths(home)[model.key]).toBe(join(home, "models", model.directory))
  })

  test(`config.yaml overrides models.${model.key}`, () => {
    const resolved = resolveModelPaths({
      home,
      file: model.override("/mnt/config/model"),
      flags: {},
    })

    expect(resolved[model.key]).toBe("/mnt/config/model")
  })

  test(`a CLI flag beats config.yaml for models.${model.key}`, () => {
    const resolved = resolveModelPaths({
      home,
      file: model.override("/mnt/config/model"),
      flags: model.override("/mnt/flag/model"),
    })

    expect(resolved[model.key]).toBe("/mnt/flag/model")
  })

  test(`models.${model.key} falls back to the home default when unset`, () => {
    const resolved = resolveModelPaths({ home, file: {}, flags: {} })

    expect(resolved[model.key]).toBe(join(home, "models", model.directory))
  })
}

test("one override does not disturb the other four models", () => {
  const resolved = resolveModelPaths({
    home,
    file: { yue2: "/mnt/YuE2-3B" },
    flags: { whisper: "/mnt/whisper" },
  })

  expect(resolved).toEqual({
    yue2: "/mnt/YuE2-3B",
    yue2Vae: join(home, "models", "YuE2-Vae"),
    sheetsage2: join(home, "models", "SheetSage2"),
    sheetsage2Base: join(home, "models", "MERT-v2-FullSong"),
    whisper: "/mnt/whisper",
  })
})

test("resolution follows a home that is not the default", () => {
  const otherHome = "/srv/yuekbox"

  expect(resolveModelPaths({ home: otherHome, file: {}, flags: {} }).sheetsage2).toBe(
    join(otherHome, "models", "SheetSage2"),
  )
})

test("a relative override is anchored to the home, not the server's working directory", () => {
  const resolved = resolveModelPaths({
    home,
    file: { yue2: "models/custom/YuE2-3B" },
    flags: { whisper: "whisper-here" },
  })

  expect(resolved.yue2).toBe(join(home, "models/custom/YuE2-3B"))
  expect(resolved.whisper).toBe(join(home, "whisper-here"))
})

test("an absolute override is kept exactly as given", () => {
  const resolved = resolveModelPaths({
    home,
    file: { yue2: "/mnt/audio/YuE2-3B" },
    flags: {},
  })

  expect(resolved.yue2).toBe("/mnt/audio/YuE2-3B")
})
