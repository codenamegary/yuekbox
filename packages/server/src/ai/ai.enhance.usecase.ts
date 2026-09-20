import { err, Result } from "../shared/result"
import { makeAttempt, makeRunWithRetries } from "./ai.attempts"
import { EnhanceError, EnhanceInput } from "./ai.models"
import { ChatCompletion, LoadStoredConfig } from "./ai.ports"
import {
  buildLyricsEnhancePrompt,
  buildStyleEnhancePrompt,
  isUsableLyrics,
  isUsableStyleBrief,
} from "./ai.prompts"
import { guardScope } from "./ai.settings"

export type EnhanceDeps = Readonly<{
  loadStoredConfig: LoadStoredConfig
  chat: ChatCompletion
  logError?: (message: string, error: unknown) => void
}>

const styleUnusableDetail = "the model's style brief was empty or over the word limit"
const lyricsUnusableDetail =
  "the model's lyrics were missing section tags or outside 150 to 400 words"

export const makeEnhance = (deps: EnhanceDeps) => {
  const attempt = makeAttempt(deps.chat)
  const runWithRetries = makeRunWithRetries(deps.logError)

  return async (input: EnhanceInput): Promise<Result<string, EnhanceError>> => {
    const guarded = await guardScope(deps.loadStoredConfig, input.kind)
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
}
