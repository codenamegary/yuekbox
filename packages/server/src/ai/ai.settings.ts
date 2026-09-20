import { EnhanceScope } from "contracts/http/ai"
import { err, ok, Result } from "../shared/result"
import { AiSettingsError, StoredConfig, StoredSetting, WriterSetting } from "./ai.models"
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
  scope: EnhanceScope,
): Result<StoredSetting, AiSettingsError> => {
  if (!stored.enabled) {
    return err({ kind: "ai_disabled", detail: "AI is disabled. Enable it in settings first." })
  }
  const setting = scope === "style" ? stored.style : stored.lyrics
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

export const guardScope = async (
  loadStoredConfig: LoadStoredConfig,
  scope: EnhanceScope,
): Promise<Result<StoredSetting, AiSettingsError>> => checkSetting(await loadStoredConfig(), scope)

export const guardBoth = async (
  loadStoredConfig: LoadStoredConfig,
): Promise<Result<Readonly<{ style: StoredSetting; lyrics: StoredSetting }>, AiSettingsError>> => {
  const stored = await loadStoredConfig()
  const style = checkSetting(stored, "style")
  if (!style.ok) return err(style.error)
  const lyrics = checkSetting(stored, "lyrics")
  if (!lyrics.ok) return err(lyrics.error)
  return ok({ style: style.value, lyrics: lyrics.value })
}
