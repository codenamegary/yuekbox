import { WriterScope } from "contracts/http/ai"
import { err, ok, Result } from "../shared/result"
import { AiNotReadyError, StoredConfig, StoredSetting, WriterSetting } from "./ai.models"
import { LoadStoredConfig } from "./ai.ports"
import { presetByBaseUrl, presetById } from "./ai.presets"

export const writerSetting = (stored: StoredSetting): WriterSetting => ({
  baseUrl: stored.baseUrl,
  apiKey: stored.apiKey,
  model: stored.model,
  effort: stored.effort,
})

export const checkSetting = (
  stored: StoredConfig,
  scope: WriterScope,
): Result<StoredSetting, AiNotReadyError> => {
  if (!stored.enabled) {
    return err({ kind: "ai_disabled", detail: "AI is disabled. Enable it in settings first." })
  }
  const setting = stored[scope]
  if (setting.model.trim() === "") {
    return err({ kind: "not_configured", detail: "Pick a model in AI settings first." })
  }
  const preset = presetByBaseUrl(setting.baseUrl) ?? presetById(setting.presetId)
  if ((preset?.needsKey ?? false) && setting.apiKey === null) {
    return err({
      kind: "not_configured",
      detail: `Add an API key for ${preset?.name ?? "this endpoint"} in AI settings.`,
    })
  }
  return ok(setting)
}

/** The visuals writer alone, as a yes/no the visualizations slice can act on. */
export const visualizationSetting = (stored: StoredConfig): Result<null, AiNotReadyError> => {
  const guarded = checkSetting(stored, "visuals")
  return guarded.ok ? ok(null) : err(guarded.error)
}

export const guardScope = async (
  loadStoredConfig: LoadStoredConfig,
  scope: WriterScope,
): Promise<Result<StoredSetting, AiNotReadyError>> => checkSetting(await loadStoredConfig(), scope)

export const guardBoth = async (
  loadStoredConfig: LoadStoredConfig,
): Promise<Result<Readonly<{ style: StoredSetting; lyrics: StoredSetting }>, AiNotReadyError>> => {
  const stored = await loadStoredConfig()
  const style = checkSetting(stored, "style")
  if (!style.ok) return err(style.error)
  const lyrics = checkSetting(stored, "lyrics")
  if (!lyrics.ok) return err(lyrics.error)
  return ok({ style: style.value, lyrics: lyrics.value })
}
