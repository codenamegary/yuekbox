import { ReadCurrentModelPaths } from "../config/config.current"
import { MissingModel, ModelDownloadKey } from "./models.models"
import { isInsideModelsDir } from "./models.paths"
import { ModelDownloadPins } from "./models.pins"
import { PathExists } from "./models.ports"

export type FindMissingModelsDeps = Readonly<{
  home: string
  /** Resolved per call, so a saved path is honored on the next attempt. */
  readModelPaths: ReadCurrentModelPaths
  pins: ModelDownloadPins
  pathExists: PathExists
}>

export type FindMissingModels = (
  input: Readonly<{ keys: readonly ModelDownloadKey[] }>,
) => Promise<readonly MissingModel[]>

/**
 * The missing subset of `keys`, each with its pinned name and size and the
 * path the app looked at. `downloadable` is false when the resolved path is
 * outside `<home>/models`, where yuekbox refuses to write.
 */
export const makeFindMissingModels =
  (deps: FindMissingModelsDeps): FindMissingModels =>
  async (input) => {
    const modelPaths = await deps.readModelPaths()
    const found = await Promise.all(
      input.keys.map(async (key): Promise<MissingModel | null> => {
        const pin = deps.pins[key]
        const path = modelPaths[key]
        if (await deps.pathExists(path)) return null
        return Object.freeze({
          key,
          name: pin.name,
          path,
          sizeBytes: pin.totalBytes,
          downloadable: isInsideModelsDir(deps.home, path),
        })
      }),
    )
    return Object.freeze(found.filter((model): model is MissingModel => model !== null))
  }
