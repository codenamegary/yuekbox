import { SongStage } from "contracts/http/songs"
import { SongCot, StageProgressUpdate, TruncatedFlags } from "../songs/songs.models"

export type GenerateSongError =
  | Readonly<{ kind: "yue2_failed"; detail: string }>
  | Readonly<{ kind: "yue2_missing"; detail: string }>

export type EncodeSongError = Readonly<{ kind: "encode_failed"; detail: string }>

export type TranscribeError = Readonly<{ kind: "transcribe_failed"; detail: string }>

export type RunYue2GenerateInput = Readonly<{
  songId: string
  lyrics: string
  style: string
  seed: number
  cot: SongCot
  abc: string | null
  outputDir: string
  onStage: (stage: SongStage) => void
  onProgress: (progress: StageProgressUpdate) => void
}>

export type RunYue2GenerateOutput = Readonly<{
  flacPath: string
  scoreAbc: string | null
  durationSeconds: number
  truncated: TruncatedFlags
  stages: readonly SongStage[]
}>

export type RunTranscribeInput = Readonly<{
  audioPath: string
  outputDir: string
}>

export type RunTranscribeOutput = Readonly<{
  scoreAbc: string
}>
