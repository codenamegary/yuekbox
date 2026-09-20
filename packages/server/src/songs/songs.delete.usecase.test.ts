import { expect, test } from "bun:test"
import { makeDeleteSong } from "./songs.delete.usecase"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

test("delete removes the row first, then unlinks the media", async () => {
  const calls: string[] = []
  const deleteSong = makeDeleteSong({
    deleteSong: async (id) => {
      calls.push(`delete:${id}`)
      return true
    },
    removeSongAudio: async (id) => {
      calls.push(`remove:${id}`)
    },
  })

  const result = await deleteSong(songId)

  expect(result.ok).toBe(true)
  expect(calls).toEqual([`delete:${songId}`, `remove:${songId}`])
})

test("delete leaves media alone when the row is missing", async () => {
  const calls: string[] = []
  const deleteSong = makeDeleteSong({
    deleteSong: async () => {
      calls.push("delete")
      return false
    },
    removeSongAudio: async () => {
      calls.push("remove")
    },
  })

  const result = await deleteSong(songId)

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("not_found")
  expect(calls).toEqual(["delete"])
})
