import { expect, test } from "bun:test"
import { ModelPaths } from "contracts/http/config"
import { modelDownloadPins } from "./models.pins"
import { makeFindMissingModels } from "./models.find.usecase"

const home = "/home/u/.yuekbox"
const modelPaths: ModelPaths = Object.freeze({
  yue2: `${home}/models/YuE2-3B`,
  yue2Vae: `${home}/models/YuE2-Vae`,
  sheetsage2: `${home}/models/SheetSage2`,
  sheetsage2Base: "/mnt/audio/MERT-v2-FullSong",
  whisper: `${home}/models/whisper-large-v3-turbo`,
})

test("reports only the missing keys, in input order, with pinned names and sizes", async () => {
  const findMissingModels = makeFindMissingModels({
    home,
    readModelPaths: async () => modelPaths,
    pins: modelDownloadPins,
    pathExists: async (path) => path === modelPaths.yue2,
  })

  const missing = await findMissingModels({ keys: ["yue2", "yue2Vae", "sheetsage2Base"] })

  expect(missing).toEqual([
    {
      key: "yue2Vae",
      name: "YuE2-Vae",
      path: modelPaths.yue2Vae,
      sizeBytes: modelDownloadPins.yue2Vae.totalBytes,
      downloadable: true,
    },
    {
      key: "sheetsage2Base",
      name: "MERT-v2-FullSong",
      path: "/mnt/audio/MERT-v2-FullSong",
      sizeBytes: modelDownloadPins.sheetsage2Base.totalBytes,
      downloadable: false,
    },
  ])
})

test("a custom path the user pointed inside the home is still downloadable", async () => {
  const findMissingModels = makeFindMissingModels({
    home,
    readModelPaths: async () => ({ ...modelPaths, yue2: `${home}/models/custom-yue2` }),
    pins: modelDownloadPins,
    pathExists: async () => false,
  })

  const missing = await findMissingModels({ keys: ["yue2"] })

  expect(missing).toHaveLength(1)
  expect(missing[0]?.downloadable).toBe(true)
})
