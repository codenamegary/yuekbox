import { Song } from "contracts/http/songs"

export type Draft = Readonly<{ style: string; lyrics: string }>

export const countWords = (text: string): number =>
  text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length

export const draftIsEmpty = (draft: Draft): boolean =>
  draft.style.trim().length === 0 && draft.lyrics.trim().length === 0

export const draftMatchesSong = (draft: Draft, song: Song): boolean =>
  draft.style.trim() === song.style && draft.lyrics.trim() === song.lyrics

export const shouldConfirmLoad = (draft: Draft, song: Song): boolean =>
  !draftIsEmpty(draft) && !draftMatchesSong(draft, song)
