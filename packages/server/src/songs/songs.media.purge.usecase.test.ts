import { expect, test } from "bun:test"
import { makePurgeStaleReferences } from "./songs.media.purge.usecase"

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
