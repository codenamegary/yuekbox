import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  makeLoadModelOverrides,
  makeSaveModelOverrides,
  parseConfigFile,
} from "./config.yaml.adapters"

const withTempDir = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "yuekbox-config-test-"))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test("an empty or models-less file means no overrides", () => {
  expect(parseConfigFile("")).toEqual({})
  expect(parseConfigFile("   \n")).toEqual({})
  expect(parseConfigFile("models:\n")).toEqual({})
  expect(parseConfigFile("models: {}\n")).toEqual({})
})

test("parses the five model overrides", () => {
  const text = `models:
  yue2: /mnt/YuE2-3B
  yue2Vae: /mnt/YuE2-Vae
  sheetsage2: /mnt/SheetSage2
  sheetsage2Base: /mnt/MERT-v2-FullSong
  whisper: /mnt/whisper-large-v3-turbo
`

  expect(parseConfigFile(text)).toEqual({
    yue2: "/mnt/YuE2-3B",
    yue2Vae: "/mnt/YuE2-Vae",
    sheetsage2: "/mnt/SheetSage2",
    sheetsage2Base: "/mnt/MERT-v2-FullSong",
    whisper: "/mnt/whisper-large-v3-turbo",
  })
})

test("parses a quoted path and a partial file", () => {
  expect(parseConfigFile('models:\n  whisper: "/mnt/models with spaces/whisper"\n')).toEqual({
    whisper: "/mnt/models with spaces/whisper",
  })
})

test("unknown keys and wrong types fail loud", () => {
  expect(() => parseConfigFile("models:\n  yue1: /mnt/x\n")).toThrow("expected shape")
  expect(() => parseConfigFile("models:\n  yue2: 42\n")).toThrow("expected shape")
  expect(() => parseConfigFile("model:\n  yue2: /mnt/x\n")).toThrow("expected shape")
})

test("malformed YAML fails loud", () => {
  expect(() => parseConfigFile("models: [\n")).toThrow("valid YAML")
})

test("a missing config file means no overrides", async () => {
  await withTempDir(async (dir) => {
    expect(await makeLoadModelOverrides(join(dir, "config.yaml"))()).toEqual({})
  })
})

test("loads the overrides from disk", async () => {
  await withTempDir(async (dir) => {
    const configPath = join(dir, "config.yaml")
    await writeFile(configPath, "models:\n  sheetsage2: /mnt/SheetSage2\n", "utf8")

    expect(await makeLoadModelOverrides(configPath)()).toEqual({ sheetsage2: "/mnt/SheetSage2" })
  })
})

test("a malformed config file fails with its path", async () => {
  await withTempDir(async (dir) => {
    const configPath = join(dir, "config.yaml")
    await writeFile(configPath, "models:\n  yue1: /mnt/x\n", "utf8")

    const failureDetail = async (): Promise<string> => {
      try {
        await makeLoadModelOverrides(configPath)()
        return ""
      } catch (error: unknown) {
        return error instanceof Error ? error.message : String(error)
      }
    }

    expect(await failureDetail()).toContain(configPath)
  })
})

test("saving creates the home and writes the file with no temp left behind", async () => {
  await withTempDir(async (dir) => {
    const configPath = join(dir, "home", "config.yaml")

    await makeSaveModelOverrides(configPath)({ yue2: "/mnt/YuE2-3B" })

    expect(existsSync(configPath)).toBe(true)
    expect(existsSync(`${configPath}.tmp`)).toBe(false)
    expect(await makeLoadModelOverrides(configPath)()).toEqual({ yue2: "/mnt/YuE2-3B" })
  })
})

test("saving replaces existing overrides", async () => {
  await withTempDir(async (dir) => {
    const configPath = join(dir, "config.yaml")
    await makeSaveModelOverrides(configPath)({ yue2: "/mnt/old" })
    await makeSaveModelOverrides(configPath)({ whisper: "/mnt/new" })

    expect(await makeLoadModelOverrides(configPath)()).toEqual({ whisper: "/mnt/new" })
  })
})

test("the saved file is human-readable YAML keyed by models", async () => {
  await withTempDir(async (dir) => {
    const configPath = join(dir, "config.yaml")
    await makeSaveModelOverrides(configPath)({ yue2Vae: "/mnt/YuE2-Vae" })

    const text = await readFile(configPath, "utf8")

    expect(text).toContain("models:")
    expect(Bun.YAML.parse(text)).toEqual({ models: { yue2Vae: "/mnt/YuE2-Vae" } })
  })
})
