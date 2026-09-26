import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { parseCliArgs } from "./config.argv"

test("argv with no flags means no overrides, no provisioning, and the default home", () => {
  expect(parseCliArgs(["bun", "src/server.ts"])).toEqual({
    home: null,
    configPath: null,
    models: {},
    provision: false,
  })
})

test("--provision asks for a provisioning run and takes no value", () => {
  expect(parseCliArgs(["bun", "src/server.ts", "--provision"])).toMatchObject({
    provision: true,
  })
  expect(parseCliArgs(["--provision", "--home", "/srv/yuekbox"])).toEqual({
    home: "/srv/yuekbox",
    configPath: null,
    models: {},
    provision: true,
  })
})

test("--provision=true is not a valid flag", () => {
  expect(() => parseCliArgs(["--provision=true"])).toThrow("unknown flag: --provision")
})

test("model flags mirror the five config keys", () => {
  expect(
    parseCliArgs([
      "bun",
      "src/server.ts",
      "--yue2-model",
      "/mnt/YuE2-3B",
      "--yue2-vae",
      "/mnt/YuE2-Vae",
      "--sheetsage2",
      "/mnt/SheetSage2",
      "--sheetsage2-base",
      "/mnt/MERT-v2-FullSong",
      "--whisper",
      "/mnt/whisper-large-v3-turbo",
    ]),
  ).toEqual({
    home: null,
    configPath: null,
    models: {
      yue2: "/mnt/YuE2-3B",
      yue2Vae: "/mnt/YuE2-Vae",
      sheetsage2: "/mnt/SheetSage2",
      sheetsage2Base: "/mnt/MERT-v2-FullSong",
      whisper: "/mnt/whisper-large-v3-turbo",
    },
    provision: false,
  })
})

test("accepts --flag=value", () => {
  expect(parseCliArgs(["--home=/srv/yuekbox", "--yue2-model=/mnt/YuE2-3B"])).toEqual({
    home: "/srv/yuekbox",
    configPath: null,
    models: { yue2: "/mnt/YuE2-3B" },
    provision: false,
  })
})

test("--home and --config point at a home and a config file", () => {
  expect(parseCliArgs(["--config", "/etc/yuekbox.yaml", "--home", "/srv/yuekbox"])).toEqual({
    home: "/srv/yuekbox",
    configPath: "/etc/yuekbox.yaml",
    models: {},
    provision: false,
  })
})

test("the last occurrence of a flag wins", () => {
  expect(parseCliArgs(["--whisper", "/mnt/one", "--whisper", "/mnt/two"]).models.whisper).toBe(
    "/mnt/two",
  )
})

test("positional arguments and everything after -- are ignored", () => {
  expect(parseCliArgs(["bun", "src/server.ts", "--", "--whisper", "/mnt/x"])).toEqual({
    home: null,
    configPath: null,
    models: {},
    provision: false,
  })
})

test("an unknown flag fails loudly", () => {
  expect(() => parseCliArgs(["--nope"])).toThrow("unknown flag: --nope")
})

test("a flag without a value fails loudly", () => {
  expect(() => parseCliArgs(["--home"])).toThrow("--home needs a value")
  expect(() => parseCliArgs(["--yue2-model", "--config"])).toThrow("--yue2-model needs a value")
})

test("an empty value fails loudly", () => {
  expect(() => parseCliArgs(["--home="])).toThrow("--home needs a value")
  expect(() => parseCliArgs(["--whisper", "   "])).toThrow("--whisper needs a value")
})

test("a relative flag value is anchored to the shell's working directory", () => {
  const parsed = parseCliArgs(["--yue2-model", "./m", "--home", "yuekbox-home"])

  expect(parsed.models.yue2).toBe(resolve(process.cwd(), "./m"))
  expect(parsed.home).toBe(resolve(process.cwd(), "yuekbox-home"))
})

test("an absolute flag value is kept exactly as given", () => {
  const parsed = parseCliArgs(["--yue2-model", "/mnt/audio/YuE2-3B"])

  expect(parsed.models.yue2).toBe("/mnt/audio/YuE2-3B")
})
