import { expect, test } from "bun:test"
import { makeCreateReference, CreateReferenceDeps } from "./references.usecase"
import { Reference } from "./songs.models"

const referenceId = "01J8K3R4P9ABCDEFGHJKMNPQRT"
const now = "2026-09-17T04:00:00.000Z"

const toReference = (byteLength: number): Reference =>
  Object.freeze({
    id: referenceId,
    songId: null,
    filename: "demo-song.mp3",
    contentType: "audio/mpeg",
    byteLength,
    audioPath: `/media/references/${referenceId}.mp3`,
    scoreAbc: null,
    createdAt: now,
  })

const makeDeps = (calls: string[], failInsert = false): CreateReferenceDeps => ({
  putReferenceAudio: async (_referenceId, audio) => {
    calls.push("put")
    return audio.byteLength
  },
  insertReference: async (reference) => {
    calls.push(`insert:${reference.byteLength}:${reference.contentType}`)
    if (failInsert) throw new Error("row commit failed")
    return toReference(reference.byteLength)
  },
  removeReferenceAudio: async () => {
    calls.push("remove")
  },
  now: () => now,
  generateId: () => referenceId,
})

test("create writes the file first, then commits the row", async () => {
  const calls: string[] = []
  const createReference = makeCreateReference(makeDeps(calls))

  const result = await createReference({
    filename: "demo-song.mp3",
    contentType: "audio/mpeg",
    audio: new Uint8Array([1, 2, 3, 4]),
  })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.id).toBe(referenceId)
  expect(result.value.byteLength).toBe(4)
  expect(calls).toEqual(["put", "insert:4:audio/mpeg"])
})

test("create unlinks the file when the row commit fails", async () => {
  const calls: string[] = []
  const createReference = makeCreateReference(makeDeps(calls, true))

  const failure = await createReference({
    filename: "demo-song.mp3",
    contentType: "audio/mpeg",
    audio: new Uint8Array([1, 2]),
  }).then(
    () => "resolved",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )

  expect(failure).toBe("row commit failed")
  expect(calls).toEqual(["put", "insert:2:audio/mpeg", "remove"])
})

test("create rejects an invalid filename before writing anything", async () => {
  const calls: string[] = []
  const createReference = makeCreateReference(makeDeps(calls))

  const result = await createReference({
    filename: "../demo.mp3",
    contentType: "audio/mpeg",
    audio: new Uint8Array([1, 2, 3]),
  })

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("validation_error")
  expect(calls).toEqual([])
})
