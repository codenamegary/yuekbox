import { Calibration, SongStage, SongStatus, VocalSpan } from "contracts/http/songs"

export type SongCot = "full" | "melody" | "off"

export type SongReference = Readonly<{
  id: string
  filename: string
}>

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
  reference: SongReference | null
  scoreAbc: string | null
  calibration: Calibration | null
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
  cot: SongCot
  createdAt: string
  updatedAt: string
}>

export type Reference = Readonly<{
  id: string
  filename: string
  contentType: string
  byteLength: number
  createdAt: string
}>

export type CreateReferenceInput = Readonly<{
  filename: string
  contentType: string
  audio: Uint8Array
}>

export type CreateReferenceError = Readonly<{
  kind: "validation_error"
  pointer: string
  code: string
}>

export const referenceUnavailableCode = "reference_unavailable"

export type TruncatedFlags = Readonly<{
  abc: boolean
  semantic: boolean
}>

export type StageProgressUpdate = Readonly<{
  stage: SongStage
  completed: number
  total: number
}>

export type TranscribeReference = Readonly<{
  referenceId: string
  audioPath: string | null
}>

export type CompleteSongInput = Readonly<{
  songId: string
  mp3: Uint8Array
  scoreAbc: string | null
  calibration: readonly VocalSpan[] | null
  durationSeconds: number
  truncated: TruncatedFlags
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

export type ByteRange = Readonly<{ start: number; end: number }>

export type SongAudioPayload = Readonly<{
  contentType: string
  byteLength: number
  read: (range: ByteRange | null) => Promise<Uint8Array>
}>

export const interruptedErrorDetail = "interrupted"
