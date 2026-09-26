import { expect, test } from "bun:test"
import { downloadTempDir, isInsideModelsDir, modelsRoot } from "./models.paths"

const home = "/home/u/.yuekbox"

test("models live under the home's models folder", () => {
  expect(modelsRoot(home)).toBe("/home/u/.yuekbox/models")
})

test("a default model path is inside the models folder", () => {
  expect(isInsideModelsDir(home, `${home}/models/YuE2-3B`)).toBe(true)
  expect(isInsideModelsDir(home, `${home}/models/custom/nested`)).toBe(true)
})

test("paths outside the models folder are refused, including siblings and the root itself", () => {
  expect(isInsideModelsDir(home, "/mnt/audio/YuE2-3B")).toBe(false)
  expect(isInsideModelsDir(home, `${home}/models-other/YuE2-3B`)).toBe(false)
  expect(isInsideModelsDir(home, `${home}/models`)).toBe(false)
  expect(isInsideModelsDir(home, `${home}/models/../data/media`)).toBe(false)
})

test("the staging tree is not a model, so a path inside it is refused", () => {
  expect(isInsideModelsDir(home, downloadTempDir(home, "yue2"))).toBe(false)
  expect(isInsideModelsDir(home, `${home}/models/.downloads/whisper`)).toBe(false)
  expect(isInsideModelsDir(home, `${home}/models/.downloads`)).toBe(false)
  expect(isInsideModelsDir(home, `${home}/models/.downloads-extra`)).toBe(true)
})

test("a download stages under the models folder in a hidden downloads directory", () => {
  expect(downloadTempDir(home, "yue2")).toBe("/home/u/.yuekbox/models/.downloads/yue2")
})
