import { AiConfig, AiConfigPatch, AiModels, EnhanceScope, Preset } from "contracts/http/ai"
import { Result } from "../shared/result"
import { Song } from "../songs/songs.models"
import { OpenAIError, WriterSetting } from "./ai.openai"

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
}>

export type AiConfigStore = Readonly<{
  /** Wire-safe view: API keys replaced by hints. */
  load: () => Promise<AiConfig>
  /** Full view including secrets, for server-side API calls only. */
  loadInternal: () => Promise<StoredConfig>
  save: (patch: AiConfigPatch) => Promise<AiConfig>
}>

export type OpenAIChat = (
  setting: WriterSetting,
  system: string,
  user: string,
  timeoutMs?: number,
) => Promise<Result<string, OpenAIError>>

export type OpenAIModels = (
  setting: Pick<WriterSetting, "baseUrl" | "apiKey">,
) => Promise<Result<readonly string[], OpenAIError>>

export type AiSettingsError = Readonly<
  | { kind: "ai_disabled"; detail: string }
  | { kind: "not_configured"; detail: string }
  | { kind: "upstream_failed"; detail: string }
>

export type EnhanceError = AiSettingsError | { kind: "empty_result"; detail: string }

export type RandomSongError = AiSettingsError | { kind: "unparseable"; detail: string }

export type EnhanceInput = Readonly<{
  kind: EnhanceScope
  style: string
  lyrics: string
}>

export type AiSlice = Readonly<{
  listPresets: () => readonly Preset[]
  getConfig: () => Promise<AiConfig>
  saveConfig: (patch: AiConfigPatch) => Promise<AiConfig>
  fetchModels: (scope: EnhanceScope) => Promise<AiModelsResult>
  enhance: (input: EnhanceInput) => Promise<Result<string, EnhanceError>>
  randomSong: () => Promise<Result<Song, RandomSongError>>
}>

export type AiModelsResult = AiModels
