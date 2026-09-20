import { expect, test } from "bun:test"
import { makeSaveSongAudio, SaveSongAudioDeps } from "./songs.media.usecase"

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
