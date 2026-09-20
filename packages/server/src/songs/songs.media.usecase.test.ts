import { expect, test } from "bun:test"
import {
  makePurgeStaleReferences,
  makeSaveSongAudio,
  SaveSongAudioDeps,
} from "./songs.media.usecase"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

const makeDeps = (calls: string[], failInsert = false): SaveSongAudioDeps => ({
  putSongAudio: async (_songId, mp3) => {
    calls.push("put")
    return mp3.byteLength
  },
  insertSongAudio: async (row) => {
    calls.push(`insert:${row.byteLength}:${row.contentType}`)
    if (failInsert) throw new Error("row commit failed")
  },
  removeSongAudio: async () => {
    calls.push("remove")
  },
})

test("save writes the file first, then commits the row", async () => {
  const calls: string[] = []
  const save = makeSaveSongAudio(makeDeps(calls))

  await save({ songId, mp3: new Uint8Array([1, 2, 3, 4]), contentType: "audio/mpeg" })

  expect(calls).toEqual(["put", "insert:4:audio/mpeg"])
})

test("save unlinks the file when the row commit fails", async () => {
  const calls: string[] = []
  const save = makeSaveSongAudio(makeDeps(calls, true))

  const failure = await save({
    songId,
    mp3: new Uint8Array([1, 2]),
    contentType: "audio/mpeg",
  }).then(
    () => "resolved",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )

  expect(failure).toBe("row commit failed")
  expect(calls).toEqual(["put", "insert:2:audio/mpeg", "remove"])
})

test("purge unlinks every deleted reference file", async () => {
  const calls: string[] = []
  const purge = makePurgeStaleReferences({
    deleteStaleReferences: async (createdBefore) => {
      calls.push(`delete:${createdBefore}`)
      return [
        { id: "01J8K3R4P9ABCDEFGHJKMNPQRA", contentType: "audio/mpeg" },
        { id: "01J8K3R4P9ABCDEFGHJKMNPQRB", contentType: "audio/wav" },
      ]
    },
    removeReferenceAudio: async (referenceId, contentType) => {
      calls.push(`remove:${referenceId}:${contentType}`)
    },
  })

  const removed = await purge("2026-09-17T04:00:00.000Z")

  expect(removed).toBe(2)
  expect(calls).toEqual([
    "delete:2026-09-17T04:00:00.000Z",
    "remove:01J8K3R4P9ABCDEFGHJKMNPQRA:audio/mpeg",
    "remove:01J8K3R4P9ABCDEFGHJKMNPQRB:audio/wav",
  ])
})

test("purge with nothing stale unlinks nothing", async () => {
  const calls: string[] = []
  const purge = makePurgeStaleReferences({
    deleteStaleReferences: async () => [],
    removeReferenceAudio: async (referenceId) => {
      calls.push(`remove:${referenceId}`)
    },
  })

  expect(await purge("2026-09-17T04:00:00.000Z")).toBe(0)
  expect(calls).toEqual([])
})
