import { expect, test } from "bun:test"
import { songFixture } from "./songs.fixtures"
import { CreateSongDeps, makeCreateSong } from "./songs.create.usecase"
import { NewSong, Song } from "./songs.models"

const fixedSongId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
const referenceId = "01J8K3R4P9ABCDEFGHJKMNPQRT"

const toQueuedSong = (song: NewSong): Song =>
  songFixture({
    id: song.id,
    lyrics: song.lyrics,
    style: song.style,
    seed: song.seed,
    cot: song.cot,
    createdAt: song.createdAt,
    updatedAt: song.updatedAt,
  })

type Harness = Readonly<{
  deps: CreateSongDeps
  inserted: NewSong[]
  calls: string[]
}>

const makeHarness = (
  options: Readonly<{ uploads?: readonly string[]; failMove?: boolean }> = {},
): Harness => {
  const inserted: NewSong[] = []
  const calls: string[] = []
  const uploads = options.uploads ?? []

  const deps: CreateSongDeps = {
    insertSong: async (song) => {
      inserted.push(song)
      return toQueuedSong(song)
    },
    deleteSong: async (songId) => {
      calls.push(`delete:${songId}`)
      return true
    },
    makeDirectory: async (key) => {
      calls.push(`mkdir:${key}`)
    },
    moveFile: async (fromKey, toKey) => {
      calls.push(`move:${fromKey}->${toKey}`)
      if (options.failMove ?? false) throw new Error("disk full")
    },
    removeDirectory: async (key) => {
      calls.push(`rmdir:${key}`)
    },
    find: async (pattern: string) => {
      calls.push(`find:${pattern}`)
      return uploads
    },
    now: () => "2026-09-17T04:00:00.000Z",
    generateId: () => fixedSongId,
    randomSeed: () => 424242,
  }

  return { deps, inserted, calls }
}

test("create inserts a queued song and makes its folder", async () => {
  const harness = makeHarness()
  const createSong = makeCreateSong(harness.deps)

  const result = await createSong({ lyrics: "hello", style: "warm piano pop" })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.status).toBe("queued")
  expect(result.value.id).toBe(fixedSongId)
  expect(result.value.seed).toBe(424242)
  expect(result.value.cot).toBe("full")
  expect(result.value.reference).toBeNull()
  expect(harness.inserted).toHaveLength(1)
  expect(harness.calls).toEqual([`mkdir:hello_${fixedSongId}`])
})

test("create moves an uploaded reference into the folder and returns its summary", async () => {
  const harness = makeHarness({ uploads: [`temp/Demo Song_${referenceId}.mp3`] })
  const createSong = makeCreateSong(harness.deps)

  const result = await createSong({ lyrics: "hello", style: "jazz", referenceId })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.cot).toBe("melody")
  expect(result.value.reference).toEqual({ id: referenceId, filename: "Demo Song.mp3" })
  expect(harness.calls).toEqual([
    `find:temp/*_${referenceId}.*`,
    `mkdir:hello_${fixedSongId}`,
    `move:temp/Demo Song_${referenceId}.mp3->hello_${fixedSongId}/references/Demo Song_${referenceId}.mp3`,
  ])
})

test("create rejects a missing upload before inserting", async () => {
  const harness = makeHarness()
  const createSong = makeCreateSong(harness.deps)

  const result = await createSong({ lyrics: "hello", style: "jazz", referenceId })

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.pointer).toBe("/referenceId")
  expect(result.error.code).toBe("reference_unavailable")
  expect(harness.inserted).toHaveLength(0)
  expect(harness.calls).toEqual([`find:temp/*_${referenceId}.*`])
})

test("create rolls back the row and the folder when the move fails", async () => {
  const harness = makeHarness({ uploads: [`temp/demo_${referenceId}.mp3`], failMove: true })
  const createSong = makeCreateSong(harness.deps)

  const outcome = await createSong({ lyrics: "hello", style: "jazz", referenceId }).then(
    () => "resolved",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )

  expect(outcome).toBe("disk full")
  expect(harness.calls).toContain(`delete:${fixedSongId}`)
  expect(harness.calls).toContain(`rmdir:hello_${fixedSongId}`)
})

test("create rejects empty and whitespace-only lyrics", async () => {
  const harness = makeHarness()
  const createSong = makeCreateSong(harness.deps)

  const empty = await createSong({ lyrics: "", style: "warm piano pop" })
  const blank = await createSong({ lyrics: "   ", style: "warm piano pop" })

  expect(empty.ok).toBe(false)
  expect(blank.ok).toBe(false)
  if (empty.ok) return
  expect(empty.error.pointer).toBe("/lyrics")
  expect(harness.calls).toEqual([])
})

test("create rejects empty and whitespace-only style", async () => {
  const harness = makeHarness()
  const createSong = makeCreateSong(harness.deps)

  const empty = await createSong({ lyrics: "hello", style: "" })
  const blank = await createSong({ lyrics: "hello", style: "  " })

  expect(empty.ok).toBe(false)
  expect(blank.ok).toBe(false)
  if (empty.ok) return
  expect(empty.error.pointer).toBe("/style")
})

test("create keeps an explicit seed", async () => {
  const harness = makeHarness()
  const createSong = makeCreateSong(harness.deps)

  const result = await createSong({ lyrics: "hello", style: "pop", seed: 7 })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.seed).toBe(7)
})

test("create trims lyrics and style before insert", async () => {
  const harness = makeHarness()
  const createSong = makeCreateSong(harness.deps)

  const result = await createSong({ lyrics: "  hello  ", style: "  pop  " })

  expect(result.ok).toBe(true)
  expect(harness.inserted[0]?.lyrics).toBe("hello")
  expect(harness.inserted[0]?.style).toBe("pop")
})
