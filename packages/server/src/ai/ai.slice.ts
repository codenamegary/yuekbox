import { AiConfigPatch, AiModels, EnhanceScope, Preset } from "contracts/http/ai"
import { err, ok, Result } from "../shared/result"
import { CreateSongBody } from "contracts/http/songs"
import { Song } from "../songs/songs.models"
import { SongsSlice } from "../songs/songs.assembly"
import {
  buildLyricsEnhancePrompt,
  buildRandomSongPrompt,
  buildStyleEnhancePrompt,
  parseEnhanceText,
  parseRandomSong,
  pickStyleNudge,
} from "./ai.prompts"
import { knownPresets, presetByBaseUrl, presetById, toPresetDescriptor } from "./ai.presets"
import {
  AiConfigStore,
  AiSettingsError,
  AiSlice,
  EnhanceError,
  EnhanceInput,
  RandomSongError,
  StoredSetting,
} from "./ai.models"
import { WriterSetting } from "./ai.openai"

export type AiSliceDeps = Readonly<{
  configStore: AiConfigStore
  chat: (
    setting: WriterSetting,
    system: string,
    user: string,
    timeoutMs?: number,
  ) => Promise<Result<string, { kind: "upstream"; detail: string }>>
  listModels: (
    setting: Pick<WriterSetting, "baseUrl" | "apiKey">,
  ) => Promise<Result<readonly string[], { kind: "upstream"; detail: string }>>
  songs?: Pick<SongsSlice, "createSong" | "worker">
  logError?: (message: string, error: unknown) => void
}>

/** Landed songs read better with a persona; the API takes a system line. */
const systemPrompt =
  "You are the in-house songwriter and style director for a text-to-song model. " +
  "You answer with exactly what is asked for and nothing else: no quotes, no markdown, no commentary."

const writerSetting = (stored: StoredSetting): WriterSetting => ({
  baseUrl: stored.baseUrl,
  apiKey: stored.apiKey,
  model: stored.model,
  effort: stored.effort,
})

const guard = async (
  configStore: AiConfigStore,
  scope: EnhanceScope,
): Promise<Result<StoredSetting, AiSettingsError>> => {
  const stored = await configStore.loadInternal()
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

export const assembleAiSlice = (deps: AiSliceDeps): AiSlice => {
  const listPresets = (): readonly Preset[] => knownPresets.map(toPresetDescriptor)

  const fetchModels = async (scope: EnhanceScope): Promise<AiModels> => {
    const stored = await deps.configStore.loadInternal()
    const setting = scope === "style" ? stored.style : stored.lyrics
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

  const runPrompt = async (
    scope: EnhanceScope,
    user: string,
  ): Promise<Result<string, AiSettingsError>> => {
    const guarded = await guard(deps.configStore, scope)
    if (!guarded.ok) return err(guarded.error)
    const result = await deps.chat(writerSetting(guarded.value), systemPrompt, user)
    if (!result.ok) {
      return err({ kind: "upstream_failed", detail: result.error.detail })
    }
    return ok(result.value)
  }

  const enhance = async (input: EnhanceInput): Promise<Result<string, EnhanceError>> => {
    const user =
      input.kind === "style"
        ? buildStyleEnhancePrompt({
            style: input.style.trim() === "" ? "freeform — surprise the listener" : input.style,
            lyrics: input.lyrics,
            nudge: pickStyleNudge(),
          })
        : buildLyricsEnhancePrompt({ style: input.style, lyrics: input.lyrics })
    const result = await runPrompt(input.kind, user)
    if (!result.ok) return result
    const text = parseEnhanceText(result.value)
    if (text === null) {
      return err({ kind: "empty_result", detail: "the model replied with nothing usable" })
    }
    return ok(text)
  }

  const randomSong = async (): Promise<Result<Song, RandomSongError>> => {
    if (deps.songs === undefined) {
      return err({ kind: "upstream_failed", detail: "song queue is not wired up" })
    }
    const result = await runPrompt("lyrics", buildRandomSongPrompt({ nudge: pickStyleNudge() }))
    if (!result.ok) return result

    const draft = parseRandomSong(result.value)
    if (draft === null) {
      return err({
        kind: "unparseable",
        detail: "the model's song did not parse into style + lyrics",
      })
    }

    const body: CreateSongBody = {
      style: draft.style.slice(0, 2000),
      lyrics: draft.lyrics.slice(0, 20000),
    }
    const created = await deps.songs.createSong(body)
    if (!created.ok) {
      return err({ kind: "upstream_failed", detail: "generated song failed validation" })
    }
    deps.songs.worker.kick()
    return ok(created.value)
  }

  return {
    listPresets,
    getConfig: () => deps.configStore.load(),
    saveConfig: (patch: AiConfigPatch) => deps.configStore.save(patch),
    fetchModels,
    enhance,
    randomSong,
  }
}
