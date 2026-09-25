import { expect, test } from "bun:test"
import {
  Config,
  ConfigPatch,
  ConfigPatchSchema,
  ConfigSchema,
  configPath,
  ModelPaths,
  ModelPathsSchema,
} from "./config"

test("configPath is /v1/config", () => {
  expect(configPath).toBe("/v1/config")
})

test("parses the five effective model paths", () => {
  const fixture: Config = {
    models: {
      yue2: "/home/u/.yuekbox/models/YuE2-3B",
      yue2Vae: "/home/u/.yuekbox/models/YuE2-Vae",
      sheetsage2: "/home/u/.yuekbox/models/SheetSage2",
      sheetsage2Base: "/home/u/.yuekbox/models/MERT-v2-FullSong",
      whisper: "/home/u/.yuekbox/models/whisper-large-v3-turbo",
    },
  }

  expect(ConfigSchema.parse(fixture)).toEqual(fixture)
})

test("parses a partial model-path update", () => {
  const patch: ConfigPatch = { models: { yue2: "/mnt/audio/YuE2-3B" } }

  expect(ConfigPatchSchema.parse(patch)).toEqual(patch)
})

test("parses an empty model-path update", () => {
  expect(ConfigPatchSchema.parse({ models: {} })).toEqual({ models: {} })
})

test("rejects a patch without a models object", () => {
  expect(ConfigPatchSchema.safeParse({ yue2: "/mnt/YuE2-3B" }).success).toBe(false)
})

test("rejects an unknown model key", () => {
  expect(ModelPathsSchema.safeParse({ yue2: "/mnt/YuE2-3B", yue1: "/mnt/x" }).success).toBe(false)
  expect(ConfigPatchSchema.safeParse({ models: { sheetsage: "/mnt/x" } }).success).toBe(false)
})

test("rejects an empty or whitespace path", () => {
  expect(ModelPathsSchema.safeParse({ ...fixturePaths, whisper: "   " }).success).toBe(false)
})

test("rejects a path that is not a string", () => {
  expect(ConfigPatchSchema.safeParse({ models: { yue2: 42 } }).success).toBe(false)
})

const fixturePaths: ModelPaths = {
  yue2: "/mnt/YuE2-3B",
  yue2Vae: "/mnt/YuE2-Vae",
  sheetsage2: "/mnt/SheetSage2",
  sheetsage2Base: "/mnt/MERT-v2-FullSong",
  whisper: "/mnt/whisper-large-v3-turbo",
}
