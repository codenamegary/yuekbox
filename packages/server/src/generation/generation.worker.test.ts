import { expect, test } from "bun:test"
import { ok } from "../shared/result"
import { songFixture } from "../songs/songs.fixtures"
import { Song } from "../songs/songs.models"
import { makeSongWorker, SongWorkerDeps } from "./generation.worker"

const queuedSong: Song = songFixture({ lyrics: "[Verse]\nhello" })

type Artifacts = {
  completedMp3: Uint8Array | null
  completedScore: string | null
  completedDuration: number | null
  completedTruncated: Readonly<{ abc: boolean; semantic: boolean }> | null
  referenceScore: string | null
}

const makeHarness = (overrides: Partial<SongWorkerDeps> = {}) => {
  const calls: string[] = []
  const artifacts: Artifacts = {
    completedMp3: null,
    completedScore: null,
    completedDuration: null,
    completedTruncated: null,
    referenceScore: null,
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
    markSongFailed: async (_songId, detail) => {
      calls.push(`failed:${detail}`)
    },
    findReferenceBySongId: async () => null,
    saveReferenceScore: async (_songId, scoreAbc) => {
      calls.push("save-reference-score")
      artifacts.referenceScore = scoreAbc
    },
    completeSong: async (input) => {
      calls.push("complete")
      artifacts.completedMp3 = input.mp3
      artifacts.completedScore = input.scoreAbc
      artifacts.completedDuration = input.durationSeconds
      artifacts.completedTruncated = input.truncated
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
    runTranscribe: async () => {
      calls.push("transcribe")
      return ok({ scoreAbc: "X:1\nK:C\nC D E|" })
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
    worker.wake()
    await worker.drain()
  }

  return { calls, artifacts, run }
}

test("complete path writes the mp3 and score through one capability", async () => {
  const harness = makeHarness()

  await harness.run()

  expect(harness.calls).toEqual([
    "running",
    "generate:full:no-abc",
    "stage:plan",
    "stage:semantic",
    "stage:encode",
    "encode",
    "complete",
    "cleanup",
  ])
  expect(harness.artifacts.completedMp3).toEqual(new Uint8Array([1, 2, 3, 4]))
  expect(harness.artifacts.completedScore).toBe("X:1\nK:C\nC D E F|")
  expect(harness.artifacts.completedDuration).toBe(184.5)
  expect(harness.artifacts.completedTruncated).toEqual({ abc: false, semantic: false })
})

test("generate failure marks the song failed and completes nothing", async () => {
  const harness = makeHarness({
    runYue2Generate: async () => {
      await Promise.resolve()
      return { ok: false, error: { kind: "yue2_failed", detail: "CUDA out of memory" } }
    },
  })

  await harness.run()

  expect(harness.calls).toContain("failed:CUDA out of memory")
  expect(harness.calls).not.toContain("complete")
  expect(harness.artifacts.completedMp3).toBeNull()
  expect(harness.calls).toContain("cleanup")
})

test("encode failure marks the song failed and writes nothing", async () => {
  const harness = makeHarness({
    encodeFlacToMp3: async () => {
      await Promise.resolve()
      return { ok: false, error: { kind: "encode_failed", detail: "ffmpeg exited 1" } }
    },
  })

  await harness.run()

  expect(harness.calls).toContain("stage:encode")
  expect(harness.calls).toContain("failed:ffmpeg exited 1")
  expect(harness.artifacts.completedMp3).toBeNull()
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
  const transcribedPaths: string[] = []
  const audioPath = "/media/song-folder/references/demo-song_01J8K3R4P9ABCDEFGHJKMNPQRT.mp3"
  const harness = makeHarness({
    findReferenceBySongId: async () => ({
      referenceId: "01J8K3R4P9ABCDEFGHJKMNPQRT",
      audioPath,
    }),
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
    "save-reference-score",
    "generate:melody:abc",
    "stage:plan",
    "stage:semantic",
    "stage:encode",
    "encode",
    "complete",
    "cleanup",
  ])
  expect(harness.artifacts.referenceScore).toBe("X:1\nK:C\nC D E|")
})

test("a reference file missing on disk fails the song before transcribing", async () => {
  const harness = makeHarness({
    findReferenceBySongId: async () => ({
      referenceId: "01J8K3R4P9ABCDEFGHJKMNPQRT",
      audioPath: null,
    }),
  })

  await harness.run()

  expect(harness.calls).toContain("failed:reference audio is missing")
  expect(harness.calls).not.toContain("transcribe")
  expect(harness.calls).not.toContain("generate:melody:abc")
  expect(harness.calls).toContain("cleanup")
})

test("a transcription failure marks the song failed without generating", async () => {
  const harness = makeHarness({
    findReferenceBySongId: async () => ({
      referenceId: "01J8K3R4P9ABCDEFGHJKMNPQRT",
      audioPath: "/media/song-folder/references/demo-song_01J8K3R4P9ABCDEFGHJKMNPQRT.mp3",
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
