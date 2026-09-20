import { AiConfig, AiConfigPatch } from "contracts/http/ai"
import { SaveConfig } from "./ai.ports"

export type SaveConfigDeps = Readonly<{
  saveConfig: SaveConfig
}>

export const makeSaveConfig =
  (deps: SaveConfigDeps) =>
  async (patch: AiConfigPatch): Promise<AiConfig> =>
    deps.saveConfig(patch)
