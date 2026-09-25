import { Config, ConfigPatch, ModelPathOverrides } from "contracts/http/config"
import { LoadModelOverrides, SaveModelOverrides } from "./config.ports"
import { resolveModelPaths } from "./config.resolve"

export type UpdateConfigDeps = Readonly<{
  loadModelOverrides: LoadModelOverrides
  saveModelOverrides: SaveModelOverrides
  home: string
  flags: ModelPathOverrides
}>

/**
 * Merges a partial model-path update into config.yaml and returns the effective
 * paths. An empty patch is a read and never writes the file.
 */
export const makeUpdateConfig =
  (deps: UpdateConfigDeps) =>
  async (patch: ConfigPatch): Promise<Config> => {
    const stored = await deps.loadModelOverrides()
    const next = { ...stored, ...patch.models }
    if (Object.keys(patch.models).length > 0) {
      await deps.saveModelOverrides(next)
    }
    return {
      models: resolveModelPaths({ home: deps.home, file: next, flags: deps.flags }),
    }
  }
