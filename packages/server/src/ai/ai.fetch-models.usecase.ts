import { WriterScope } from "contracts/http/ai"
import { AiModelsResult } from "./ai.models"
import { ListModels, LoadStoredConfig } from "./ai.ports"
import { presetByBaseUrl, presetById } from "./ai.presets"

export type FetchModelsDeps = Readonly<{
  loadStoredConfig: LoadStoredConfig
  listModels: ListModels
}>

export const makeFetchModels =
  (deps: FetchModelsDeps) =>
  async (scope: WriterScope): Promise<AiModelsResult> => {
    const stored = await deps.loadStoredConfig()
    const setting = stored[scope]
    const result = await deps.listModels({ baseUrl: setting.baseUrl, apiKey: setting.apiKey })
    if (result.ok && result.value.length > 0) {
      return { models: [...result.value], live: true }
    }
    const detail = result.ok ? "the endpoint listed no models" : result.error.detail
    const preset = presetByBaseUrl(setting.baseUrl) ?? presetById(setting.presetId)
    return {
      models: [...(preset?.defaultModels ?? [])],
      live: false,
      detail,
    }
  }
