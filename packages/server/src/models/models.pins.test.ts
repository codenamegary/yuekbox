import { expect, test } from "bun:test"
import { expectedModelSizes, modelReadinessKeys } from "../readiness/readiness.models"
import { modelDirectoryNames } from "../shared/home"
import { modelDownloadKeys } from "./models.models"
import { modelDownloadPins } from "./models.pins"

test("pins every model with the same keys and folders readiness reports", () => {
  expect(modelDownloadKeys).toEqual(modelReadinessKeys)
  for (const key of modelDownloadKeys) {
    expect(modelDownloadPins[key].key).toBe(key)
    expect(modelDownloadPins[key].directory).toBe(modelDirectoryNames[key])
  }
})

test("pins the five upstream repositories at immutable revision SHAs", () => {
  expect(modelDownloadPins.yue2.repo).toBe("m-a-p/YuE2-3B")
  expect(modelDownloadPins.yue2Vae.repo).toBe("m-a-p/YuE2-Vae")
  expect(modelDownloadPins.sheetsage2.repo).toBe("m-a-p/SheetSage2")
  expect(modelDownloadPins.sheetsage2Base.repo).toBe("m-a-p/MERT-v2-FullSong")
  expect(modelDownloadPins.whisper.repo).toBe("openai/whisper-large-v3-turbo")

  for (const key of modelDownloadKeys) {
    expect(modelDownloadPins[key].revision).toMatch(/^[0-9a-f]{40}$/)
  }
})

test("pinned byte totals are the totals readiness promises for a download", () => {
  for (const key of modelDownloadKeys) {
    expect(modelDownloadPins[key].totalBytes).toBe(expectedModelSizes[key])
  }
})

test("carries a plain display name for every model", () => {
  expect(modelDownloadPins.yue2.name).toBe("YuE2-3B")
  expect(modelDownloadPins.yue2Vae.name).toBe("YuE2-Vae")
  expect(modelDownloadPins.sheetsage2.name).toBe("SheetSage2")
  expect(modelDownloadPins.sheetsage2Base.name).toBe("MERT-v2-FullSong")
  expect(modelDownloadPins.whisper.name).toBe("Whisper large-v3-turbo")
})
