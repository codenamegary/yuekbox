import { expect, test } from "bun:test"
import { makeDeleteSong } from "./songs.delete.usecase"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

test("delete removes the row and the folder", async () => {
  const calls: string[] = []
  const deleteSong = makeDeleteSong({
    deleteSong: async (id) => {
      calls.push(`delete:${id}`)
      return true
    },
    removeSongFolder: async (id) => {
      calls.push(`remove-folder:${id}`)
    },
    logError: (message) => {
      calls.push(`log:${message}`)
    },
  })

  const result = await deleteSong(songId)

  expect(result.ok).toBe(true)
  expect(calls).toEqual([`delete:${songId}`, `remove-folder:${songId}`])
})

test("delete reports not-found but still clears the folder", async () => {
  const calls: string[] = []
  const deleteSong = makeDeleteSong({
    deleteSong: async () => {
      calls.push("delete")
      return false
    },
    removeSongFolder: async () => {
      calls.push("remove-folder")
    },
    logError: () => {},
  })

  const result = await deleteSong(songId)

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("not_found")
  expect(calls).toEqual(["delete", "remove-folder"])
})

test("a folder removal failure is logged, not fatal", async () => {
  const logs: string[] = []
  const deleteSong = makeDeleteSong({
    deleteSong: async () => true,
    removeSongFolder: async () => {
      throw new Error("permission denied")
    },
    logError: (message) => {
      logs.push(message)
    },
  })

  const result = await deleteSong(songId)

  expect(result.ok).toBe(true)
  expect(logs).toEqual(["song folder removal failed"])
})
