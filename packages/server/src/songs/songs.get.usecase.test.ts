import { expect, test } from "bun:test"
import { Song } from "./songs.models"
import { makeGetSong } from "./songs.get.usecase"

const song: Song = Object.freeze({
  id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
  status: "queued",
  stage: null,
  stageCompleted: null,
  stageTotal: null,
  lyrics: "hello",
  style: "pop",
  seed: 1,
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

test("get returns the song when it exists", async () => {
  const getSong = makeGetSong({ findSongById: async () => song })

  const result = await getSong(song.id)

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value).toEqual(song)
})

test("get missing id is not-found", async () => {
  const getSong = makeGetSong({ findSongById: async () => null })

  const result = await getSong("01J8K3R4P9ABCDEFGHJKMNPQRT")

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("not_found")
})
