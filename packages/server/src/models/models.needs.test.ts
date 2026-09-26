import { expect, test } from "bun:test"
import { modelsRequiredForGeneration } from "./models.needs"

test("a freeform Song needs the generator and its VAE", () => {
  expect(modelsRequiredForGeneration({ hasReference: false })).toEqual(["yue2", "yue2Vae"])
})

test("a reference cover additionally needs SheetSage2 and its base model", () => {
  expect(modelsRequiredForGeneration({ hasReference: true })).toEqual([
    "yue2",
    "yue2Vae",
    "sheetsage2",
    "sheetsage2Base",
  ])
})

test("whisper never blocks a Song; its absence only drops the lyric cues", () => {
  expect(modelsRequiredForGeneration({ hasReference: false })).not.toContain("whisper")
  expect(modelsRequiredForGeneration({ hasReference: true })).not.toContain("whisper")
})
