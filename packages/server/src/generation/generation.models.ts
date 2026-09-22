import { Calibration, SongStage } from "contracts/http/songs"
import { AnalysisBeat, AnalysisNote, AnalysisSection } from "contracts/http/visualizations"
import { SongCot, StageProgressUpdate, TruncatedFlags } from "../songs/songs.models"

export type GenerateSongError =
  | Readonly<{ kind: "yue2_failed"; detail: string }>
  | Readonly<{ kind: "yue2_missing"; detail: string }>

export type EncodeSongError = Readonly<{ kind: "encode_failed"; detail: string }>

export type TranscribeError = Readonly<{ kind: "transcribe_failed"; detail: string }>

export type LyricAlignError = Readonly<{ kind: "lyric_align_failed"; detail: string }>

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

export type RunLyricAlignInput = Readonly<{
  audioPath: string
  outputDir: string
}>

export type RunLyricAlignOutput = Readonly<{
  calibration: Calibration
}>

export type VocalTranscriptError = Readonly<{ kind: "vocal_transcribe_failed"; detail: string }>

export type RunVocalTranscriptInput = Readonly<{
  audioPath: string
  outputDir: string
  durationSeconds: number
}>

/** The measured slices plus the raw output tree that the Song folder keeps. */
export type RunVocalTranscriptOutput = Readonly<{
  notes: AnalysisNote[]
  beats: AnalysisBeat[]
  sections: AnalysisSection[]
  transcriptDir: string
}>
