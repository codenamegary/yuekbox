import { modelKeyOrder } from "contracts/http/models"
import { expect, test } from "bun:test"
import { modelDirectoryNames } from "../shared/home"
import { modelDownloadKeys } from "./models.models"
import {
  expectedModelSizes,
  expectedModelSizesFor,
  modelDownloadPins,
  modelDownloadPinsFor,
} from "./models.pins"

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

test("macOS pins the pre-converted MLX model and the revisions the port verifies", () => {
  const pins = modelDownloadPinsFor("macos")

  // The MLX runtime refuses any generator except its pinned conversion, so
  // the download ships the converted weights instead of the CUDA-side repo.
  expect(pins.yue2.repo).toBe("vanch007/mlx-Yue2-3B")
  expect(pins.yue2.revision).toMatch(/^[0-9a-f]{40}$/)
  expect(pins.yue2.directory).toBe(modelDirectoryNames.yue2)
  expect(pins.yue2Vae.repo).toBe("m-a-p/YuE2-Vae")
  expect(pins.yue2Vae.revision).toBe("95535e72a97bc0f09b8ada125d26b4009428c0e8")
  // The MLX transcriber verifies a pinned SheetSage2 revision of its own.
  expect(pins.sheetsage2.repo).toBe("m-a-p/SheetSage2")
  expect(pins.sheetsage2.revision).toBe("eab522a8168e8b8b8c4856bf8609cd86198f01fe")
  expect(pins.sheetsage2Base.repo).toBe("m-a-p/MERT-v2-FullSong")
  // The aligner transcribes with mlx-whisper, whose weights live in the
  // community MLX conversion of the same whisper model.
  expect(pins.whisper.repo).toBe("mlx-community/whisper-large-v3-turbo")

  for (const key of modelDownloadKeys) {
    expect(pins[key].revision).toMatch(/^[0-9a-f]{40}$/)
    expect(pins[key].totalBytes).toBeGreaterThan(0)
    expect(pins[key].directory).toBe(modelDirectoryNames[key])
  }
})

test("macOS readiness sizes come from the macOS pins", () => {
  const pins = modelDownloadPinsFor("macos")
  const sizes = expectedModelSizesFor("macos")

  for (const key of modelDownloadKeys) {
    expect(sizes[key]).toBe(pins[key].totalBytes)
  }
  expect(sizes.yue2).toBe(9_920_193_845)
})

test("linux and macOS never drift on keys, folders, or the shared base model", () => {
  const linux = modelDownloadPinsFor("linux")
  const macos = modelDownloadPinsFor("macos")

  for (const key of modelDownloadKeys) {
    expect(linux[key].directory).toBe(macos[key].directory)
    expect(linux[key].key).toBe(macos[key].key)
  }
  expect(linux.sheetsage2Base.repo).toBe(macos.sheetsage2Base.repo)
  expect(linux.sheetsage2Base.revision).toBe(macos.sheetsage2Base.revision)
  expect(linux.sheetsage2Base.totalBytes).toBe(macos.sheetsage2Base.totalBytes)
})
