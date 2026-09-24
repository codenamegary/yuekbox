import { Song, SongStage, SongStatus, StageProgress } from "contracts/http/songs"

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

export type ReelRows = Readonly<{
  labels: readonly string[]
  activeIndex: number
}>

/** The slot-machine reel: queued, every stage in order, then the terminal word. */
export const reelRowsFor = (song: Song): ReelRows => {
  const stages = stageOrderFor(song.reference !== undefined)
  const terminal = song.status === "failed" ? "Failed" : "Ready"
  const labels: readonly string[] = [
    "Queued",
    ...stages.map((stage) => stageLabels[stage]),
    terminal,
  ]

  if (song.status === "queued") return { labels, activeIndex: 0 }
  if (song.status === "running") {
    const stageIndex = song.stage === undefined ? -1 : stages.indexOf(song.stage)
    return { labels, activeIndex: stageIndex + 1 }
  }
  return { labels, activeIndex: labels.length - 1 }
}

/** Progress bar width as a clamped percent. Absent when the stage reports no numbers. */
export const stageProgressPercent = (progress: StageProgress | undefined): number | null =>
  progress === undefined
    ? null
    : Math.max(0, Math.min(100, (progress.completed / progress.total) * 100))

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
