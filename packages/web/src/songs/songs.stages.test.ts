import { expect, test } from "bun:test"
import { Song, SongStage } from "contracts/http/songs"
import {
  baseStageOrder,
  coverStageOrder,
  formatDuration,
  reelRowsFor,
  stageLabels,
  stageOrderFor,
  stageProgressPercent,
  statusLabels,
} from "./songs.stages"

const queuedSong: Song = {
  id: "song-queued",
  status: "queued",
  lyrics: "la la la",
  style: "warm piano pop",
  title: "la la la",
  seed: 1,
  createdAt: "2026-09-23T04:00:00.000Z",
  updatedAt: "2026-09-23T04:00:00.000Z",
}

const runningSong = (stage: SongStage): Song => ({
  ...queuedSong,
  id: `song-${stage}`,
  status: "running",
  stage,
})

const coverSong = (stage: SongStage): Song => ({
  ...runningSong(stage),
  reference: { id: "song-reference", filename: "reference.mp3" },
})

const completeSong: Song = {
  ...queuedSong,
  status: "complete",
  durationSeconds: 12,
  truncated: { abc: false, semantic: false },
  completedAt: "2026-09-23T04:01:00.000Z",
}

const failedSong: Song = {
  ...queuedSong,
  status: "failed",
  errorDetail: "boom",
  completedAt: "2026-09-23T04:01:00.000Z",
}

test("formatDuration pads minutes and seconds", () => {
  expect(formatDuration(0)).toBe("00:00")
  expect(formatDuration(65.4)).toBe("01:05")
  expect(formatDuration(194.2)).toBe("03:14")
})

test("stage order covers the spec stages and the lyric sync", () => {
  expect(baseStageOrder).toEqual(["plan", "semantic", "synthesize", "decode", "encode", "sync"])
})

test("cover stage order transcribes instead of planning", () => {
  expect(stageOrderFor(false)).toEqual(baseStageOrder)
  expect(stageOrderFor(true)).toEqual(coverStageOrder)
  expect(coverStageOrder).toEqual([
    "transcribe",
    "semantic",
    "synthesize",
    "decode",
    "encode",
    "sync",
  ])
})

test("every stage has a label", () => {
  expect(Object.keys(stageLabels).sort()).toEqual([...baseStageOrder, "transcribe"].sort())
  expect(stageLabels.sync).toBe("Syncing lyrics")
})

test("status labels cover every status", () => {
  expect(statusLabels.queued).toBe("Queued")
  expect(statusLabels.failed).toBe("Failed")
})

test("reel rows run queued, base stages, ready", () => {
  const reel = reelRowsFor(queuedSong)
  expect(reel.labels).toEqual([
    "Queued",
    "Writing score",
    "Writing music",
    "Synthesizing",
    "Decoding audio",
    "Encoding mp3",
    "Syncing lyrics",
    "Ready",
  ])
  expect(reel.activeIndex).toBe(0)
})

test("reel centers the running stage", () => {
  expect(reelRowsFor(runningSong("synthesize")).activeIndex).toBe(3)
  expect(reelRowsFor(runningSong("sync")).activeIndex).toBe(6)
})

test("cover reel transcribes instead of planning", () => {
  const reel = reelRowsFor(coverSong("transcribe"))
  expect(reel.labels[1]).toBe("Transcribing reference")
  expect(reel.activeIndex).toBe(1)
})

test("complete reel lands on ready", () => {
  const reel = reelRowsFor(completeSong)
  expect(reel.labels[reel.labels.length - 1]).toBe("Ready")
  expect(reel.activeIndex).toBe(reel.labels.length - 1)
})

test("failed reel replaces ready with failed", () => {
  const reel = reelRowsFor(failedSong)
  expect(reel.labels[reel.labels.length - 1]).toBe("Failed")
  expect(reel.activeIndex).toBe(reel.labels.length - 1)
  expect(reel.labels).not.toContain("Ready")
})

test("stage progress percent maps completed over total", () => {
  expect(stageProgressPercent({ completed: 12, total: 40 })).toBe(30)
  expect(stageProgressPercent({ completed: 0, total: 8 })).toBe(0)
  expect(stageProgressPercent({ completed: 8, total: 8 })).toBe(100)
})

test("stage progress percent has no value without progress", () => {
  expect(stageProgressPercent(undefined)).toBeNull()
})

test("stage progress percent clamps at 100", () => {
  expect(stageProgressPercent({ completed: 9, total: 8 })).toBe(100)
})
