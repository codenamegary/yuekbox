import { ReadCurrentModelPaths } from "../config/config.current"
import { HostPlatform, hostPlatform } from "../shared/platform"
import { FindMissingGenerationModels, ModelDownloadKey } from "./models.models"
import { makeModelDownloads, ModelDownloads } from "./models.downloads"
import { makeFindMissingModels } from "./models.find.usecase"
import {
  makeEnsureDirectory,
  makeMeasureFileBytes,
  makeMoveDirectory,
  makePathExists,
  makeRemoveDirectory,
} from "./models.fs.adapters"
import { FetchLike, makeDownloadModelFile, makeReadModelTree } from "./models.hf.adapters"
import { modelsRequiredForGeneration } from "./models.needs"
import { expectedModelSizesFor, modelDownloadPinsFor, ModelDownloadPins } from "./models.pins"

export type AssembleModelsDeps = Readonly<{
  home: string
  /** Resolved per request, so `PUT /v1/config` takes effect with no restart. */
  readModelPaths: ReadCurrentModelPaths
  /** Defaults to the machine the process runs on; tests pass one explicitly. */
  platform?: HostPlatform
  /** Test seam; the process root leaves it at the fetch global. */
  fetchImpl?: FetchLike
  /** Test seam; the process root leaves it at the pinned manifest. */
  pins?: ModelDownloadPins
  logError?: (message: string, error: unknown) => void
}>

export type ModelsSlice = Readonly<{
  downloads: ModelDownloads
  findMissingGenerationModels: FindMissingGenerationModels
  /** The byte total a full download writes, straight from the pins. */
  expectedModelSizes: Readonly<Record<ModelDownloadKey, number>>
}>

/**
 * Wires the models slice: network adapters for the pinned Hugging Face
 * snapshot, filesystem adapters for staging and the atomic move, and the
 * generation need mapping. The process root supplies the home and the live
 * model-path resolver; nothing here reads config on its own. The pins are
 * the platform's set, so a Mac downloads the revisions the MLX runtime
 * verifies and a Linux box the ones the CUDA stack does.
 */
export const assembleModelsSlice = (deps: AssembleModelsDeps): ModelsSlice => {
  const platform = deps.platform ?? hostPlatform()
  const fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init))
  const pins = deps.pins ?? modelDownloadPinsFor(platform)
  const pathExists = makePathExists()

  const downloads = makeModelDownloads({
    home: deps.home,
    readModelPaths: deps.readModelPaths,
    pins,
    readModelTree: makeReadModelTree(fetchImpl),
    downloadFile: makeDownloadModelFile(fetchImpl),
    pathExists,
    ensureDirectory: makeEnsureDirectory(),
    moveDirectory: makeMoveDirectory(),
    removeDirectory: makeRemoveDirectory(),
    measureFileBytes: makeMeasureFileBytes(),
    logError: deps.logError,
  })

  const findMissingModels = makeFindMissingModels({
    home: deps.home,
    readModelPaths: deps.readModelPaths,
    pins,
    pathExists,
  })

  return {
    downloads,
    findMissingGenerationModels: async ({ hasReference }) =>
      findMissingModels({ keys: modelsRequiredForGeneration({ hasReference }) }),
    expectedModelSizes: expectedModelSizesFor(platform),
  }
}
