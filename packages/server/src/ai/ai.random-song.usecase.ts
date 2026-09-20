import { CreateSongBody } from "contracts/http/songs"
import { err, ok, Result } from "../shared/result"
import { Song } from "../songs/songs.models"
import { CreateSong } from "../songs/songs.ports"
import { makeAttempt, makeRunWithRetries } from "./ai.attempts"
import { RandomSongError } from "./ai.models"
import { ChatCompletion, LoadStoredConfig } from "./ai.ports"
import {
  buildRandomLyricsPrompt,
  buildRandomStylePrompt,
  isUsableLyrics,
  isUsableStyleBrief,
} from "./ai.prompts"
import { guardBoth } from "./ai.settings"

export type RandomSongDeps = Readonly<{
  loadStoredConfig: LoadStoredConfig
  chat: ChatCompletion
  createSong: CreateSong
  wake: () => void
  logError?: (message: string, error: unknown) => void
}>

const styleUnusableDetail = "the model's style brief was empty or over the word limit"
const lyricsUnusableDetail =
  "the model's lyrics were missing section tags or outside 150 to 400 words"

export const makeRandomSong = (deps: RandomSongDeps) => {
  const attempt = makeAttempt(deps.chat)
  const runWithRetries = makeRunWithRetries(deps.logError)

  return async (): Promise<Result<Song, RandomSongError>> => {
    const guarded = await guardBoth(deps.loadStoredConfig)
    if (!guarded.ok) return err(guarded.error)

    const style = await runWithRetries(() =>
      attempt(
        guarded.value.style,
        buildRandomStylePrompt(),
        (text) => (isUsableStyleBrief(text) ? null : styleUnusableDetail),
        styleUnusableDetail,
      ),
    )
    if (!style.ok) return style

    const lyrics = await runWithRetries(() =>
      attempt(
        guarded.value.lyrics,
        buildRandomLyricsPrompt(style.value),
        (text) => (isUsableLyrics(text) ? null : lyricsUnusableDetail),
        lyricsUnusableDetail,
      ),
    )
    if (!lyrics.ok) return lyrics

    const body: CreateSongBody = {
      style: style.value.slice(0, 2000),
      lyrics: lyrics.value.slice(0, 20000),
    }
    const created = await deps.createSong(body)
    if (!created.ok) {
      return err({ kind: "upstream_failed", detail: "generated song failed validation" })
    }
    deps.wake()
    return ok(created.value)
  }
}
