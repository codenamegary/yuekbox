import { expect, test } from "bun:test"
import { songFixture } from "./songs.fixtures"
import { makeCompleteSong } from "./songs.complete.usecase"
import { Song } from "./songs.models"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
const folderKey = "hello_01J8K3R4P9ABCDEFGHJKMNPQRS"

const makeHarness = (options: Readonly<{ failComplete?: boolean; song?: Song | null }> = {}) => {
  const calls: string[] = []
  const files = new Map<string, Uint8Array>()
  const completed: Array<Readonly<{ durationSeconds: number; truncated: unknown }>> = []

  const completeSong = makeCompleteSong({
    findSongById: async () =>
      options.song === undefined ? songFixture({ id: songId }) : options.song,
    resolveSongFolder: async () => folderKey,
    putFile: async (key, bytes) => {
      calls.push(`put:${key}`)
      files.set(key, bytes)
      return bytes.byteLength
    },
    removeFile: async (key) => {
      calls.push(`remove:${key}`)
      files.delete(key)
    },
    markSongComplete: async (input) => {
      calls.push("complete")
      if (options.failComplete ?? false) throw new Error("database is gone")
      completed.push({ durationSeconds: input.durationSeconds, truncated: input.truncated })
    },
  })

  return { completeSong, calls, files, completed }
}

test("complete writes the mp3 and the score, then marks the row complete", async () => {
  const harness = makeHarness()

  await harness.completeSong({
    songId,
    mp3: new Uint8Array([1, 2, 3, 4]),
    scoreAbc: "X:1\nK:C\nC D E|",
    durationSeconds: 152.5,
    truncated: { abc: false, semantic: false },
  })

  expect(harness.calls).toEqual([
    `put:${folderKey}/generated_${songId}.mp3`,
    `put:${folderKey}/score.abc`,
    "complete",
  ])
  expect(Array.from(harness.files.get(`${folderKey}/generated_${songId}.mp3`) ?? [])).toEqual([
    1, 2, 3, 4,
  ])
  expect(new TextDecoder().decode(harness.files.get(`${folderKey}/score.abc`))).toBe(
    "X:1\nK:C\nC D E|",
  )
  expect(harness.completed).toEqual([
    { durationSeconds: 152.5, truncated: { abc: false, semantic: false } },
  ])
})

test("complete skips the score file when yue2 wrote no score", async () => {
  const harness = makeHarness()

  await harness.completeSong({
    songId,
    mp3: new Uint8Array([1]),
    scoreAbc: null,
    durationSeconds: 10,
    truncated: { abc: true, semantic: false },
  })

  expect(harness.calls).toEqual([`put:${folderKey}/generated_${songId}.mp3`, "complete"])
})

test("a failed row update removes the files it wrote and rethrows", async () => {
  const harness = makeHarness({ failComplete: true })

  const outcome = await harness
    .completeSong({
      songId,
      mp3: new Uint8Array([1]),
      scoreAbc: "X:1",
      durationSeconds: 10,
      truncated: { abc: false, semantic: false },
    })
    .then(
      () => "resolved",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )

  expect(outcome).toBe("database is gone")
  expect(harness.calls).toEqual([
    `put:${folderKey}/generated_${songId}.mp3`,
    `put:${folderKey}/score.abc`,
    "complete",
    `remove:${folderKey}/generated_${songId}.mp3`,
    `remove:${folderKey}/score.abc`,
  ])
  expect(harness.files.size).toBe(0)
})

test("complete fails when the song row is gone", async () => {
  const harness = makeHarness({ song: null })

  const outcome = await harness
    .completeSong({
      songId,
      mp3: new Uint8Array([1]),
      scoreAbc: null,
      durationSeconds: 10,
      truncated: { abc: false, semantic: false },
    })
    .then(
      () => "resolved",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )

  expect(outcome).toContain("is missing")
  expect(harness.calls).toEqual([])
})
