import {
  AiConfig,
  AiConfigPatch,
  EnhanceScope,
  Setting,
  SettingPatch,
  SettingPatchSchema,
  SettingSchema,
} from "contracts/http/ai"
import { StoredConfig, StoredSetting } from "./ai.models"

export const keyHintFor = (apiKey: string | null): string | null =>
  apiKey === null || apiKey === "" ? null : `···${apiKey.slice(-4)}`

export const toWireSetting = (stored: StoredSetting): Setting =>
  SettingSchema.parse({
    presetId: stored.presetId,
    baseUrl: stored.baseUrl,
    model: stored.model,
    effort: stored.effort,
    keyHint: keyHintFor(stored.apiKey),
  })

export const toWireConfig = (stored: StoredConfig): AiConfig => ({
  enabled: stored.enabled,
  style: toWireSetting(stored.style),
  lyrics: toWireSetting(stored.lyrics),
})

export const scopeOf = (config: AiConfig, scope: EnhanceScope) =>
  scope === "style" ? config.style : config.lyrics

/**
 * Shallow per-scope merge: fields the patch omits keep their stored values,
 * and `apiKey: ""` clears the key while an omitted apiKey keeps it.
 */
export const mergeStored = (stored: StoredConfig, patch: AiConfigPatch): StoredConfig => ({
  enabled: patch.enabled ?? stored.enabled,
  style: mergeScope(stored.style, patch.style),
  lyrics: mergeScope(stored.lyrics, patch.lyrics),
})

const mergeScope = (current: StoredSetting, patch: SettingPatch | undefined): StoredSetting => {
  if (patch === undefined) return current
  const parsed = SettingPatchSchema.safeParse(patch)
  if (!parsed.success) return current
  const next = parsed.data
  return {
    presetId: next.presetId ?? current.presetId,
    baseUrl: next.baseUrl ?? current.baseUrl,
    model: next.model !== undefined ? next.model.trim() : current.model,
    effort: next.effort ?? current.effort,
    apiKey:
      next.apiKey !== undefined
        ? next.apiKey.trim() === ""
          ? null
          : next.apiKey.trim()
        : current.apiKey,
  }
}
