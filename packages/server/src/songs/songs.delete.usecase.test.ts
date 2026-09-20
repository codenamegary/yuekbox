import { expect, test } from "bun:test"
import { makeDeleteSong } from "./songs.delete.usecase"
import { Reference } from "./songs.models"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
const referenceId = "01J8K3R4P9ABCDEFGHJKMNPQRT"

const reference: Reference = Object.freeze({
  id: referenceId,
  songId,
  filename: "demo-song.mp3",
  contentType: "audio/mpeg",
  byteLength: 5,
  scoreAbc: null,
  createdAt: "2026-09-17T04:00:00.000Z",
})

test("delete removes the row first, then unlinks the media", async () => {
  const calls: string[] = []
  const deleteSong = makeDeleteSong({
    deleteSong: async (id) => {
      calls.push(`delete:${id}`)
      return true
    },
    findReferenceBySongId: async () => null,
    removeSongAudio: async (id) => {
      calls.push(`remove-song:${id}`)
    },
    removeReferenceAudio: async (id, contentType) => {
      calls.push(`remove-ref:${id}:${contentType}`)
    },
  })

  const result = await deleteSong(songId)

  expect(result.ok).toBe(true)
  expect(calls).toEqual([`delete:${songId}`, `remove-song:${songId}`])
})

test("delete unlinks an attached reference file too", async () => {
  const calls: string[] = []
  const deleteSong = makeDeleteSong({
    deleteSong: async (id) => {
      calls.push(`delete:${id}`)
      return true
    },
    findReferenceBySongId: async () => reference,
    removeSongAudio: async (id) => {
      calls.push(`remove-song:${id}`)
    },
    removeReferenceAudio: async (id, contentType) => {
      calls.push(`remove-ref:${id}:${contentType}`)
    },
  })

  const result = await deleteSong(songId)

  expect(result.ok).toBe(true)
  expect(calls).toEqual([
    `delete:${songId}`,
    `remove-song:${songId}`,
    `remove-ref:${referenceId}:audio/mpeg`,
  ])
})

test("delete leaves media alone when the row is missing", async () => {
  const calls: string[] = []
  const deleteSong = makeDeleteSong({
    deleteSong: async () => {
      calls.push("delete")
      return false
    },
    findReferenceBySongId: async () => reference,
    removeSongAudio: async () => {
      calls.push("remove-song")
    },
    removeReferenceAudio: async () => {
      calls.push("remove-ref")
    },
  })

  const result = await deleteSong(songId)

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("not_found")
  expect(calls).toEqual(["delete"])
})
