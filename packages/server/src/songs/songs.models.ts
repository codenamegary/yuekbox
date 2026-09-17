import { SongStage, SongStatus } from "contracts/http/songs"

export type Song = Readonly<{
  id: string
  status: SongStatus
  stage: SongStage | null
  stageCompleted: number | null
  stageTotal: number | null
  lyrics: string
  style: string
  seed: number
  cot: string
  scoreAbc: string | null
  durationSeconds: number | null
  truncatedAbc: boolean | null
  truncatedSemantic: boolean | null
  errorDetail: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}>

export type NewSong = Readonly<{
  id: string
  lyrics: string
  style: string
  seed: number
  cot: string
  createdAt: string
  updatedAt: string
}>

export type TruncatedFlags = Readonly<{
  abc: boolean
  semantic: boolean
}>

export type StageProgressUpdate = Readonly<{
  stage: SongStage
  completed: number
  total: number
}>

export type SongsPage = Readonly<{
  items: readonly Song[]
  limit: number
  nextCursor: string | null
  previousCursor: string | null
  count: number
}>

export type CreateSongError = Readonly<{
  kind: "validation_error"
  pointer: string
  code: string
}>

export type GetSongError = Readonly<{ kind: "not_found" }>

export type ListSongsError = Readonly<{ kind: "invalid_cursor" }>

export type DeleteSongError = Readonly<{ kind: "not_found" }>

export type SongAudioLookupError = Readonly<{ kind: "not_found" } | { kind: "not_complete" }>

export type GenerateSongError =
  | Readonly<{ kind: "yue2_failed"; detail: string }>
  | Readonly<{ kind: "yue2_missing"; detail: string }>

export type EncodeSongError = Readonly<{ kind: "encode_failed"; detail: string }>

export const interruptedErrorDetail = "interrupted"
