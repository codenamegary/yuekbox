import { expect, test } from "bun:test"
import { NewSong, Song } from "./songs.models"
import { makeCreateSong } from "./songs.create.usecase"

const fixedSongId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

const toQueuedSong = (song: NewSong): Song =>
  Object.freeze({
    ...song,
    status: "queued" as const,
    stage: null,
    stageCompleted: null,
    stageTotal: null,
    scoreAbc: null,
    durationSeconds: null,
    truncatedAbc: null,
    truncatedSemantic: null,
    errorDetail: null,
    completedAt: null,
  })

const makeDeps = (captured: NewSong[]) => ({
  insertSong: async (song: NewSong) => {
    captured.push(song)
    return toQueuedSong(song)
  },
  now: () => "2026-09-17T04:00:00.000Z",
  generateId: () => fixedSongId,
  randomSeed: () => 424242,
})

test("create returns a queued Song with cot full and a generated seed", async () => {
  const captured: NewSong[] = []
  const createSong = makeCreateSong(makeDeps(captured))

  const result = await createSong({ lyrics: "hello", style: "warm piano pop" })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.status).toBe("queued")
  expect(result.value.id).toBe(fixedSongId)
  expect(result.value.seed).toBe(424242)
  expect(result.value.cot).toBe("full")
  expect(captured).toHaveLength(1)
})

test("create rejects empty and whitespace-only lyrics", async () => {
  const createSong = makeCreateSong(makeDeps([]))

  const empty = await createSong({ lyrics: "", style: "warm piano pop" })
  const blank = await createSong({ lyrics: "   ", style: "warm piano pop" })

  expect(empty.ok).toBe(false)
  expect(blank.ok).toBe(false)
  if (empty.ok) return
  expect(empty.error.pointer).toBe("/lyrics")
})

test("create rejects empty and whitespace-only style", async () => {
  const createSong = makeCreateSong(makeDeps([]))

  const empty = await createSong({ lyrics: "hello", style: "" })
  const blank = await createSong({ lyrics: "hello", style: "  " })

  expect(empty.ok).toBe(false)
  expect(blank.ok).toBe(false)
  if (empty.ok) return
  expect(empty.error.pointer).toBe("/style")
})

test("create keeps an explicit seed", async () => {
  const captured: NewSong[] = []
  const createSong = makeCreateSong(makeDeps(captured))

  const result = await createSong({ lyrics: "hello", style: "pop", seed: 7 })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.seed).toBe(7)
})

test("create trims lyrics and style before insert", async () => {
  const captured: NewSong[] = []
  const createSong = makeCreateSong(makeDeps(captured))

  const result = await createSong({ lyrics: "  hello  ", style: "  pop  " })

  expect(result.ok).toBe(true)
  expect(captured[0]?.lyrics).toBe("hello")
  expect(captured[0]?.style).toBe("pop")
})
