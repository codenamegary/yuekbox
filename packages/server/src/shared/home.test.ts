import { expect, test } from "bun:test"
import { join } from "node:path"
import {
  alignPythonPath,
  alignVenvPath,
  defaultHome,
  generateScriptPath,
  homeLayout,
  lyricAlignScriptPath,
  mediaDir,
  modelDirectoryNames,
  pythonPath,
  sheetsage2ScriptPath,
  sqlitePath,
  venvPath,
} from "./home"

test("layout keeps tools, models, venvs, scripts, data, run, and logs under the home", () => {
  expect(homeLayout("/home/u/.yuekbox")).toEqual({
    home: "/home/u/.yuekbox",
    tools: "/home/u/.yuekbox/tools",
    models: "/home/u/.yuekbox/models",
    venvs: "/home/u/.yuekbox/venvs",
    scripts: "/home/u/.yuekbox/scripts",
    data: "/home/u/.yuekbox/data",
    run: "/home/u/.yuekbox/run",
    logs: "/home/u/.yuekbox/logs",
  })
})

test("model directory names are the upstream names", () => {
  expect(modelDirectoryNames).toEqual({
    yue2: "YuE2-3B",
    yue2Vae: "YuE2-Vae",
    sheetsage2: "SheetSage2",
    sheetsage2Base: "MERT-v2-FullSong",
    whisper: "whisper-large-v3-turbo",
  })
})

test("the one venv and the script defaults resolve under the home", () => {
  const home = "/home/u/.yuekbox"

  expect(venvPath(home)).toBe(join(home, "venvs/python"))
  expect(pythonPath(home)).toBe(join(home, "venvs/python/bin/python"))
  expect(generateScriptPath(home)).toBe(join(home, "scripts/generate.py"))
  expect(sheetsage2ScriptPath(home)).toBe(join(home, "scripts/transcribe.py"))
  expect(lyricAlignScriptPath(home)).toBe(join(home, "scripts/align.py"))
})

test("data defaults resolve under the home", () => {
  const home = "/home/u/.yuekbox"

  expect(sqlitePath(home)).toBe(join(home, "data/yuekbox.sqlite"))
  expect(mediaDir(home)).toBe(join(home, "data/media"))
})

test("the macOS align environment lives beside the shared one", () => {
  const home = "/home/u/.yuekbox"

  expect(alignVenvPath(home)).toBe(join(home, "venvs/align"))
  expect(alignPythonPath(home)).toBe(join(home, "venvs/align/bin/python"))
})

test("the default home is ~/.yuekbox", () => {
  expect(defaultHome("/home/u")).toBe("/home/u/.yuekbox")
})
