import { expect, test } from "bun:test"
import { NewSong, Reference, Song } from "./songs.models"
import { makeCreateSong } from "./songs.create.usecase"

const fixedSongId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
const referenceId = "01J8K3R4P9ABCDEFGHJKMNPQRT"

const reference: Reference = Object.freeze({
  id: referenceId,
  songId: null,
  filename: "demo-song.mp3",
  contentType: "audio/mpeg",
  byteLength: 3,
  scoreAbc: null,
  createdAt: "2026-09-17T04:00:00.000Z",
})

const toQueuedSong = (song: NewSong): Song =>
  Object.freeze({
    ...song,
    status: "queued" as const,
    stage: null,
    stageCompleted: null,
    stageTotal: null,
    reference:
      song.referenceId === null ? null : { id: song.referenceId, filename: "demo-song.mp3" },
    scoreAbc: null,
    durationSeconds: null,
    truncatedAbc: null,
    truncatedSemantic: null,
    errorDetail: null,
    completedAt: null,
  })

type HarnessOptions = Readonly<{
  reference?: Reference | null
  attach?: boolean
}>

const makeDeps = (captured: NewSong[], deleted: string[], options: HarnessOptions = {}) => {
  const findableReference = options.reference === undefined ? reference : options.reference
  return {
    insertSong: async (song: NewSong) => {
      captured.push(song)
      return toQueuedSong(song)
    },
    findReferenceById: async () => findableReference,
    attachReferenceToSong: async () => options.attach ?? true,
    findSongById: async (songId: string) => {
      const song = captured.find((candidate) => candidate.id === songId)
      return song === undefined ? null : toQueuedSong(song)
    },
    deleteSong: async (songId: string) => {
      deleted.push(songId)
      return true
    },
    now: () => "2026-09-17T04:00:00.000Z",
    generateId: () => fixedSongId,
    randomSeed: () => 424242,
  }
}

test("create returns a queued Song with cot full and a generated seed", async () => {
  const captured: NewSong[] = []
  const createSong = makeCreateSong(makeDeps(captured, []))

  const result = await createSong({ lyrics: "hello", style: "warm piano pop" })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.status).toBe("queued")
  expect(result.value.id).toBe(fixedSongId)
  expect(result.value.seed).toBe(424242)
  expect(result.value.cot).toBe("full")
  expect(result.value.reference).toBeNull()
  expect(captured).toHaveLength(1)
})

test("create with a reference attaches it and switches cot to melody", async () => {
  const captured: NewSong[] = []
  const createSong = makeCreateSong(makeDeps(captured, []))

  const result = await createSong({ lyrics: "hello", style: "jazz", referenceId })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.cot).toBe("melody")
  expect(result.value.reference).toEqual({ id: referenceId, filename: "demo-song.mp3" })
  expect(captured[0]?.referenceId).toBe(referenceId)
  expect(captured[0]?.cot).toBe("melody")
})

test("create rejects an unknown reference before inserting", async () => {
  const captured: NewSong[] = []
  const deleted: string[] = []
  const createSong = makeCreateSong(makeDeps(captured, deleted, { reference: null }))

  const result = await createSong({ lyrics: "hello", style: "jazz", referenceId })

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.pointer).toBe("/referenceId")
  expect(result.error.code).toBe("reference_unavailable")
  expect(captured).toHaveLength(0)
  expect(deleted).toHaveLength(0)
})

test("create rejects a reference that already belongs to a song", async () => {
  const captured: NewSong[] = []
  const createSong = makeCreateSong(
    makeDeps(captured, [], { reference: { ...reference, songId: "01J8K3R4P9ABCDEFGHJKMNPQRV" } }),
  )

  const result = await createSong({ lyrics: "hello", style: "jazz", referenceId })

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.code).toBe("reference_unavailable")
  expect(captured).toHaveLength(0)
})

test("create rolls back the song when the reference cannot attach", async () => {
  const captured: NewSong[] = []
  const deleted: string[] = []
  const createSong = makeCreateSong(makeDeps(captured, deleted, { attach: false }))

  const result = await createSong({ lyrics: "hello", style: "jazz", referenceId })

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.code).toBe("reference_unavailable")
  expect(captured).toHaveLength(1)
  expect(deleted).toEqual([fixedSongId])
})

test("create rejects empty and whitespace-only lyrics", async () => {
  const createSong = makeCreateSong(makeDeps([], []))

  const empty = await createSong({ lyrics: "", style: "warm piano pop" })
  const blank = await createSong({ lyrics: "   ", style: "warm piano pop" })

  expect(empty.ok).toBe(false)
  expect(blank.ok).toBe(false)
  if (empty.ok) return
  expect(empty.error.pointer).toBe("/lyrics")
})

test("create rejects empty and whitespace-only style", async () => {
  const createSong = makeCreateSong(makeDeps([], []))

  const empty = await createSong({ lyrics: "hello", style: "" })
  const blank = await createSong({ lyrics: "hello", style: "  " })

  expect(empty.ok).toBe(false)
  expect(blank.ok).toBe(false)
  if (empty.ok) return
  expect(empty.error.pointer).toBe("/style")
})

test("create keeps an explicit seed", async () => {
  const captured: NewSong[] = []
  const createSong = makeCreateSong(makeDeps(captured, []))

  const result = await createSong({ lyrics: "hello", style: "pop", seed: 7 })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.seed).toBe(7)
})

test("create trims lyrics and style before insert", async () => {
  const captured: NewSong[] = []
  const createSong = makeCreateSong(makeDeps(captured, []))

  const result = await createSong({ lyrics: "  hello  ", style: "  pop  " })

  expect(result.ok).toBe(true)
  expect(captured[0]?.lyrics).toBe("hello")
  expect(captured[0]?.style).toBe("pop")
})
