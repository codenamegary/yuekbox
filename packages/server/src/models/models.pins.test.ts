import { modelKeyOrder } from "contracts/http/models"
import { expect, test } from "bun:test"
import { modelDirectoryNames } from "../shared/home"
import { modelDownloadKeys } from "./models.models"
import { expectedModelSizes, modelDownloadPins } from "./models.pins"

/** The report order every consumer shares, straight from the contract. */
const modelReadinessKeyOrder = modelKeyOrder

test("pins every model with the same keys and folders readiness reports", () => {
  expect(modelDownloadKeys).toEqual(modelReadinessKeyOrder)
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

test("readiness sizes are the pinned byte totals, so the two cannot drift", () => {
  expect(expectedModelSizes).toEqual({
    yue2: 7_295_775_491,
    yue2Vae: 531_343_726,
    sheetsage2: 233_240_091,
    sheetsage2Base: 2_530_365_136,
    whisper: 1_622_466_054,
  })
  for (const key of modelDownloadKeys) {
    expect(expectedModelSizes[key]).toBe(modelDownloadPins[key].totalBytes)
  }
})

test("carries a plain display name for every model", () => {
  expect(modelDownloadPins.yue2.name).toBe("YuE2-3B")
  expect(modelDownloadPins.yue2Vae.name).toBe("YuE2-Vae")
  expect(modelDownloadPins.sheetsage2.name).toBe("SheetSage2")
  expect(modelDownloadPins.sheetsage2Base.name).toBe("MERT-v2-FullSong")
  expect(modelDownloadPins.whisper.name).toBe("Whisper large-v3-turbo")
})
