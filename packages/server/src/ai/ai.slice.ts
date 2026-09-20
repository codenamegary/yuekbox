import { AiConfigPatch, AiModels, EnhanceScope, Preset } from "contracts/http/ai"
import { CreateSongBody } from "contracts/http/songs"
import pRetry from "p-retry"
import { err, ok, Result } from "../shared/result"
import { SongsSlice } from "../songs/songs.assembly"
import { Song } from "../songs/songs.models"
import {
  buildLyricsEnhancePrompt,
  buildRandomLyricsPrompt,
  buildRandomStylePrompt,
  buildStyleEnhancePrompt,
  isUsableLyrics,
  isUsableStyleBrief,
  parseEnhanceText,
} from "./ai.prompts"
import { knownPresets, presetByBaseUrl, presetById, toPresetDescriptor } from "./ai.presets"
import {
  AiAttemptError,
  AiConfigStore,
  AiSettingsError,
  AiSlice,
  EnhanceError,
  EnhanceInput,
  RandomSongError,
  StoredConfig,
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

const attemptRetries = 5

const styleUnusableDetail = "the model's style brief was empty or over the word limit"
const lyricsUnusableDetail =
  "the model's lyrics were missing section tags or outside 150 to 400 words"

const writerSetting = (stored: StoredSetting): WriterSetting => ({
  baseUrl: stored.baseUrl,
  apiKey: stored.apiKey,
  model: stored.model,
  effort: stored.effort,
})

type FailedAttempt = Error & Readonly<{ kind: AiAttemptError["kind"] }>

const failedAttempt = (kind: AiAttemptError["kind"], detail: string): FailedAttempt =>
  Object.assign(new Error(detail), { kind })

const isFailedAttempt = (value: unknown): value is FailedAttempt =>
  value instanceof Error &&
  "kind" in value &&
  (value.kind === "upstream_failed" || value.kind === "unusable_result")

const checkSetting = (
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

const guard = async (
  configStore: AiConfigStore,
  scope: EnhanceScope,
): Promise<Result<StoredSetting, AiSettingsError>> =>
  checkSetting(await configStore.loadInternal(), scope)

const guardBoth = async (
  configStore: AiConfigStore,
): Promise<Result<Readonly<{ style: StoredSetting; lyrics: StoredSetting }>, AiSettingsError>> => {
  const stored = await configStore.loadInternal()
  const style = checkSetting(stored, "style")
  if (!style.ok) return err(style.error)
  const lyrics = checkSetting(stored, "lyrics")
  if (!lyrics.ok) return err(lyrics.error)
  return ok({ style: style.value, lyrics: lyrics.value })
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

  const attempt = async (
    setting: StoredSetting,
    user: string,
    usable: (text: string) => boolean,
    unusableDetail: string,
  ): Promise<Result<string, AiAttemptError>> => {
    const result = await deps.chat(writerSetting(setting), systemPrompt, user)
    if (!result.ok) {
      return err({ kind: "upstream_failed", detail: result.error.detail })
    }
    const text = parseEnhanceText(result.value)
    if (text === null || !usable(text)) {
      return err({ kind: "unusable_result", detail: unusableDetail })
    }
    return ok(text)
  }

  /** One model call plus validation, retried when either half fails. */
  const runWithRetries = async (
    run: () => Promise<Result<string, AiAttemptError>>,
  ): Promise<Result<string, AiAttemptError>> => {
    try {
      const text = await pRetry(
        async () => {
          const result = await run()
          if (!result.ok) throw failedAttempt(result.error.kind, result.error.detail)
          return result.value
        },
        {
          retries: attemptRetries,
          minTimeout: 0,
          onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
            deps.logError?.(
              `AI attempt ${attemptNumber} failed (${retriesLeft} retries left)`,
              error,
            )
          },
        },
      )
      return ok(text)
    } catch (error) {
      if (isFailedAttempt(error)) return err({ kind: error.kind, detail: error.message })
      return err({
        kind: "upstream_failed",
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const enhance = async (input: EnhanceInput): Promise<Result<string, EnhanceError>> => {
    const guarded = await guard(deps.configStore, input.kind)
    if (!guarded.ok) return err(guarded.error)
    const user =
      input.kind === "style"
        ? buildStyleEnhancePrompt({
            style: input.style.trim() === "" ? "freeform — surprise the listener" : input.style,
            lyrics: input.lyrics,
          })
        : buildLyricsEnhancePrompt({ style: input.style, lyrics: input.lyrics })
    const usable = input.kind === "style" ? isUsableStyleBrief : isUsableLyrics
    const unusableDetail = input.kind === "style" ? styleUnusableDetail : lyricsUnusableDetail
    return runWithRetries(() => attempt(guarded.value, user, usable, unusableDetail))
  }

  const randomSong = async (): Promise<Result<Song, RandomSongError>> => {
    if (deps.songs === undefined) {
      return err({ kind: "upstream_failed", detail: "song queue is not wired up" })
    }
    const guarded = await guardBoth(deps.configStore)
    if (!guarded.ok) return err(guarded.error)

    const style = await runWithRetries(() =>
      attempt(
        guarded.value.style,
        buildRandomStylePrompt(),
        isUsableStyleBrief,
        styleUnusableDetail,
      ),
    )
    if (!style.ok) return style

    const lyrics = await runWithRetries(() =>
      attempt(
        guarded.value.lyrics,
        buildRandomLyricsPrompt(style.value),
        isUsableLyrics,
        lyricsUnusableDetail,
      ),
    )
    if (!lyrics.ok) return lyrics

    const body: CreateSongBody = {
      style: style.value.slice(0, 2000),
      lyrics: lyrics.value.slice(0, 20000),
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
