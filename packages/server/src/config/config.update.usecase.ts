import { ModelKey, modelKeyOrder } from "contracts/http/models"
import { Config, ConfigPatch, ModelPathOverrides } from "contracts/http/config"
import { err, ok, Result } from "../shared/result"
import { flagForModel } from "./config.argv"
import { LoadModelOverrides, SaveModelOverrides } from "./config.ports"
import { resolveModelPaths } from "./config.resolve"

export type UpdateConfigDeps = Readonly<{
  loadModelOverrides: LoadModelOverrides
  saveModelOverrides: SaveModelOverrides
  home: string
  flags: ModelPathOverrides
}>

/** Why a write was refused: a CLI flag pins the path for this run. */
export type UpdateConfigError = Readonly<{
  kind: "flag_pinned"
  key: ModelKey
  flag: string
  detail: string
}>

/**
 * Merges a partial model-path update into config.yaml and returns the effective
 * paths. An empty patch is a read and never writes the file. A null value
 * resets a key to its default folder. A key a CLI flag pins is refused: the
 * flag would keep winning while the app pretended the folder had changed.
 */
export const makeUpdateConfig =
  (deps: UpdateConfigDeps) =>
  async (patch: ConfigPatch): Promise<Result<Config, UpdateConfigError>> => {
    const pinned = modelKeyOrder.find(
      (key) => patch.models[key] !== undefined && deps.flags[key] !== undefined,
    )
    if (pinned !== undefined) {
      const flag = flagForModel(pinned) ?? "a command line flag"
      return err({
        kind: "flag_pinned",
        key: pinned,
        flag,
        detail: `${flag} pins this model path for this run. Start yuekbox without it, then choose a folder here.`,
      })
    }

    const stored = await deps.loadModelOverrides()
    const merged: ModelPathOverrides = { ...stored, ...patch.models }
    // Reset keys drop out of the file instead of lingering as nulls, so the
    // stored config stays a plain list of folders.
    const next: ModelPathOverrides = {}
    for (const key of modelKeyOrder) {
      const value = merged[key]
      if (value !== null && value !== undefined) next[key] = value
    }
    if (Object.keys(patch.models).length > 0) {
      await deps.saveModelOverrides(next)
    }
    return ok({
      models: resolveModelPaths({ home: deps.home, file: next, flags: deps.flags }),
    })
  }
