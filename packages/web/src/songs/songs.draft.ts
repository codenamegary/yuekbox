import { EnhanceScope } from "contracts/http/ai"
import { Song } from "contracts/http/songs"

export type Draft = Readonly<{
  style: string
  lyrics: string
  cfgScale: number
  instrumental: boolean
}>

export const applyEnhanceToDraft = (draft: Draft, kind: EnhanceScope, text: string): Draft =>
  kind === "style"
    ? {
        style: text,
        lyrics: draft.lyrics,
        cfgScale: draft.cfgScale,
        instrumental: draft.instrumental,
      }
    : {
        style: draft.style,
        lyrics: text,
        cfgScale: draft.cfgScale,
        instrumental: draft.instrumental,
      }

export const countWords = (text: string): number =>
  text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length

export const draftIsEmpty = (draft: Draft): boolean =>
  draft.style.trim().length === 0 && draft.lyrics.trim().length === 0

export const draftMatchesSong = (draft: Draft, song: Song): boolean =>
  draft.instrumental === song.instrumental &&
  draft.style.trim() === song.style &&
  draft.lyrics.trim() === song.lyrics

export const shouldConfirmLoad = (draft: Draft, song: Song): boolean =>
  !draftIsEmpty(draft) && !draftMatchesSong(draft, song)
