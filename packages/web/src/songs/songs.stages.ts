import { SongStage, SongStatus } from "contracts/http/songs"

export const stageLabels: Readonly<Record<SongStage, string>> = {
  transcribe: "Transcribing reference",
  plan: "Writing score",
  semantic: "Writing music",
  synthesize: "Synthesizing",
  decode: "Decoding audio",
  encode: "Encoding mp3",
  sync: "Syncing lyrics",
}

export const baseStageOrder: readonly SongStage[] = [
  "plan",
  "semantic",
  "synthesize",
  "decode",
  "encode",
  "sync",
]

export const coverStageOrder: readonly SongStage[] = [
  "transcribe",
  "semantic",
  "synthesize",
  "decode",
  "encode",
  "sync",
]

export const stageOrderFor = (hasReference: boolean): readonly SongStage[] =>
  hasReference ? coverStageOrder : baseStageOrder

export const statusLabels: Readonly<Record<SongStatus, string>> = {
  queued: "Queued",
  running: "Running",
  complete: "Complete",
  failed: "Failed",
}

export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}
