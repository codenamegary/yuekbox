import { expect, test } from "bun:test"
import { ok } from "../shared/result"
import { Reference, Song } from "./songs.models"
import { makeSongWorker, SongWorkerDeps } from "./songs.worker"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

const queuedSong: Song = Object.freeze({
  id: songId,
  status: "queued",
  stage: null,
  stageCompleted: null,
  stageTotal: null,
  lyrics: "[Verse]\nhello",
  style: "warm piano pop",
  seed: 831001,
  cot: "full",
  reference: null,
  scoreAbc: null,
  durationSeconds: null,
  truncatedAbc: null,
  truncatedSemantic: null,
  errorDetail: null,
  createdAt: "2026-09-17T04:00:00.000Z",
  updatedAt: "2026-09-17T04:00:00.000Z",
  completedAt: null,
})

type Artifacts = {
  savedMp3: Uint8Array | null
  savedContentType: string | null
  completedScore: string | null
  completedDuration: number | null
  completedTruncated: Readonly<{ abc: boolean; semantic: boolean }> | null
}

const makeHarness = (overrides: Partial<SongWorkerDeps> = {}) => {
  const calls: string[] = []
  const artifacts: Artifacts = {
    savedMp3: null,
    savedContentType: null,
    completedScore: null,
    completedDuration: null,
    completedTruncated: null,
  }
  const queue: Song[] = [queuedSong]

  const deps: SongWorkerDeps = {
    claimNextQueuedSong: async () => queue.shift() ?? null,
    markSongRunning: async () => {
      calls.push("running")
    },
    markSongStage: async (_songId, stage) => {
      calls.push(`stage:${stage}`)
    },
    markSongProgress: async (_songId, progress) => {
      calls.push(`progress:${progress.stage}:${progress.completed}/${progress.total}`)
    },
    markSongComplete: async (input) => {
      calls.push("complete")
      artifacts.completedScore = input.scoreAbc
      artifacts.completedDuration = input.durationSeconds
      artifacts.completedTruncated = input.truncated
    },
    markSongFailed: async (_songId, detail) => {
      calls.push(`failed:${detail}`)
    },
    saveSongAudio: async (input) => {
      calls.push("save-audio")
      artifacts.savedMp3 = input.mp3
      artifacts.savedContentType = input.contentType
    },
    runYue2Generate: async (input) => {
      calls.push(`generate:${input.cot}:${input.abc === null ? "no-abc" : "abc"}`)
      input.onStage("plan")
      input.onStage("semantic")
      return ok({
        flacPath: "/tmp/yuekbox-test/out/audio.flac",
        scoreAbc: "X:1\nK:C\nC D E F|",
        durationSeconds: 184.5,
        truncated: { abc: false, semantic: false },
        stages: ["plan", "semantic"],
      })
    },
    encodeFlacToMp3: async () => {
      calls.push("encode")
      return ok(new Uint8Array([1, 2, 3, 4]))
    },
    findReferenceAudioBySongId: async () => null,
    runTranscribe: async () => {
      calls.push("transcribe")
      return ok({ scoreAbc: "X:1\nK:C\nC D E|" })
    },
    saveReferenceScore: async (referenceId) => {
      calls.push(`save-score:${referenceId}`)
    },
    createTempDir: async () => "/tmp/yuekbox-test",
    removeTempDir: async () => {
      calls.push("cleanup")
    },
    logError: (message, error) => {
      calls.push(`log:${message}:${String(error)}`)
    },
    ...overrides,
  }

  const worker = makeSongWorker(deps)

  const run = async () => {
    worker.kick()
    await worker.drain()
  }

  return { calls, artifacts, run }
}

test("complete path saves the mp3 blob and marks the song complete", async () => {
  const harness = makeHarness()

  await harness.run()

  expect(harness.calls).toEqual([
    "running",
    "generate:full:no-abc",
    "stage:plan",
    "stage:semantic",
    "stage:encode",
    "encode",
    "save-audio",
    "complete",
    "cleanup",
  ])
  expect(harness.artifacts.savedMp3).toEqual(new Uint8Array([1, 2, 3, 4]))
  expect(harness.artifacts.savedContentType).toBe("audio/mpeg")
  expect(harness.artifacts.completedScore).toBe("X:1\nK:C\nC D E F|")
  expect(harness.artifacts.completedDuration).toBe(184.5)
  expect(harness.artifacts.completedTruncated).toEqual({ abc: false, semantic: false })
})

test("generate failure marks the song failed and saves no audio", async () => {
  const harness = makeHarness({
    runYue2Generate: async () => {
      await Promise.resolve()
      return { ok: false, error: { kind: "yue2_failed", detail: "CUDA out of memory" } }
    },
  })

  await harness.run()

  expect(harness.calls).toContain("failed:CUDA out of memory")
  expect(harness.calls).not.toContain("save-audio")
  expect(harness.calls).not.toContain("complete")
  expect(harness.artifacts.savedMp3).toBeNull()
  expect(harness.calls).toContain("cleanup")
})

test("encode failure marks the song failed and leaves song_audio empty", async () => {
  const harness = makeHarness({
    encodeFlacToMp3: async () => {
      await Promise.resolve()
      return { ok: false, error: { kind: "encode_failed", detail: "ffmpeg exited 1" } }
    },
  })

  await harness.run()

  expect(harness.calls).toContain("stage:encode")
  expect(harness.calls).toContain("failed:ffmpeg exited 1")
  expect(harness.calls).not.toContain("save-audio")
  expect(harness.artifacts.savedMp3).toBeNull()
})

test("progress events are persisted between the stage transitions", async () => {
  const harness = makeHarness({
    runYue2Generate: async (input) => {
      input.onStage("synthesize")
      input.onProgress({ stage: "synthesize", completed: 3, total: 40 })
      input.onProgress({ stage: "synthesize", completed: 9, total: 40 })
      await Promise.resolve()
      return ok({
        flacPath: "/tmp/yuekbox-test/out/audio.flac",
        scoreAbc: null,
        durationSeconds: 10,
        truncated: { abc: false, semantic: false },
        stages: ["synthesize"],
      })
    },
  })

  await harness.run()

  expect(harness.calls).toContain("stage:synthesize")
  expect(harness.calls).toContain("progress:synthesize:3/40")
  expect(harness.calls).toContain("progress:synthesize:9/40")
  expect(harness.calls.indexOf("stage:synthesize")).toBeLessThan(
    harness.calls.indexOf("progress:synthesize:3/40"),
  )
})

test("a claim failure is logged, not swallowed", async () => {
  const harness = makeHarness({
    claimNextQueuedSong: async () => {
      throw new Error("database is gone")
    },
  })

  await harness.run()

  expect(harness.calls.some((call) => call.startsWith("log:worker loop failed"))).toBe(true)
  expect(harness.calls).not.toContain("cleanup")
})

test("reference songs transcribe first and generate from the melody ABC", async () => {
  const reference: Reference = {
    id: "01J8K3R4P9ABCDEFGHJKMNPQRT",
    songId: songId,
    filename: "demo-song.mp3",
    contentType: "audio/mpeg",
    byteLength: 3,
    scoreAbc: null,
    createdAt: "2026-09-17T04:00:00.000Z",
  }
  const transcribedPaths: string[] = []
  const audioPath = "/media/references/01J8K3R4P9ABCDEFGHJKMNPQRT.mp3"
  const harness = makeHarness({
    findReferenceAudioBySongId: async () => ({ reference, audioPath }),
    runTranscribe: async (input) => {
      transcribedPaths.push(input.audioPath)
      return ok({ scoreAbc: "X:1\nK:C\nC D E|" })
    },
  })

  await harness.run()

  expect(transcribedPaths).toEqual([audioPath])
  expect(harness.calls).toEqual([
    "running",
    "stage:transcribe",
    "save-score:01J8K3R4P9ABCDEFGHJKMNPQRT",
    "generate:melody:abc",
    "stage:plan",
    "stage:semantic",
    "stage:encode",
    "encode",
    "save-audio",
    "complete",
    "cleanup",
  ])
})

test("a transcription failure marks the song failed without generating", async () => {
  const reference: Reference = {
    id: "01J8K3R4P9ABCDEFGHJKMNPQRT",
    songId: songId,
    filename: "demo-song.mp3",
    contentType: "audio/mpeg",
    byteLength: 3,
    scoreAbc: null,
    createdAt: "2026-09-17T04:00:00.000Z",
  }
  const harness = makeHarness({
    findReferenceAudioBySongId: async () => ({
      reference,
      audioPath: "/media/references/01J8K3R4P9ABCDEFGHJKMNPQRT.mp3",
    }),
    runTranscribe: async () => ({
      ok: false,
      error: { kind: "transcribe_failed", detail: "SheetSage2 exploded" },
    }),
  })

  await harness.run()

  expect(harness.calls).toContain("stage:transcribe")
  expect(harness.calls).toContain("failed:SheetSage2 exploded")
  expect(harness.calls).not.toContain("generate:melody:abc")
  expect(harness.calls).not.toContain("complete")
  expect(harness.calls).toContain("cleanup")
})
