import { AiModels, EffortLevel, EffortLevelSchema, EnhanceScope } from "contracts/http/ai"

export type OpenAIError = Readonly<{ kind: "upstream"; detail: string }>
export type WriterSetting = Readonly<{
  baseUrl: string
  apiKey: string | null
  model: string
  effort: EffortLevel
}>

/** What we store per writer, including the secret that never goes back out. */
export type StoredSetting = Readonly<{
  presetId: string
  baseUrl: string
  apiKey: string | null
  model: string
  effort: WriterSetting["effort"]
}>

export type StoredConfig = Readonly<{
  enabled: boolean
  style: StoredSetting
  lyrics: StoredSetting
  visuals: StoredSetting
}>

const fallbackSetting = (): StoredSetting => ({
  presetId: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: null,
  model: "",
  effort: "medium",
})

/** AI ships disabled and unconfigured; the boxes stay exactly as they were. */
export const defaultStoredConfig = (): StoredConfig => ({
  enabled: false,
  style: fallbackSetting(),
  lyrics: fallbackSetting(),
  visuals: fallbackSetting(),
})

export const parseStoredSetting = (value: unknown): StoredSetting => {
  if (typeof value !== "object" || value === null) return fallbackSetting()
  const record = value as Record<string, unknown>
  const effort = EffortLevelSchema.safeParse(record.effort)
  return {
    presetId: typeof record.presetId === "string" ? record.presetId : "openai",
    baseUrl:
      typeof record.baseUrl === "string" && record.baseUrl !== ""
        ? record.baseUrl
        : "https://api.openai.com/v1",
    apiKey: typeof record.apiKey === "string" && record.apiKey !== "" ? record.apiKey : null,
    model: typeof record.model === "string" ? record.model : "",
    effort: effort.success ? effort.data : "medium",
  }
}

export const parseStoredConfig = (value: unknown): StoredConfig => {
  if (typeof value !== "object" || value === null) return defaultStoredConfig()
  const record = value as Record<string, unknown>
  return {
    enabled: record.enabled === true,
    style: parseStoredSetting(record.style),
    lyrics: parseStoredSetting(record.lyrics),
    visuals: parseStoredSetting(record.visuals),
  }
}

export type AiNotReadyError = Readonly<
  { kind: "ai_disabled"; detail: string } | { kind: "not_configured"; detail: string }
>

export type AiSettingsError =
  | AiNotReadyError
  | Readonly<{ kind: "upstream_failed"; detail: string }>

/** Failures a single prompt attempt can hand back for a retry. */
export type AiAttemptError = Readonly<
  { kind: "upstream_failed"; detail: string } | { kind: "unusable_result"; detail: string }
>

export type EnhanceError = AiSettingsError | AiAttemptError

/** Random song reuses the enhance failure vocabulary; it is two prompt runs. */
export type RandomSongError = EnhanceError

/** One canvas visualization authored from a Song's style and lyrics. */
export type VisualizationAuthorInput = Readonly<{
  style: string
  lyrics: string
}>

/** Authoring reuses the enhance failure vocabulary. */
export type VisualizationAuthorError = EnhanceError

export type EnhanceInput = Readonly<{
  kind: EnhanceScope
  style: string
  lyrics: string
}>

export type AiModelsResult = AiModels
