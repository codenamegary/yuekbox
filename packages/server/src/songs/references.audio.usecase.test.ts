import { expect, test } from "bun:test"
import { Reference } from "./songs.models"
import { makeFindReferenceAudioBySongId } from "./references.audio.usecase"

const reference: Reference = Object.freeze({
  id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
  songId: "01J8K3R4P9ABCDEFGHJKMNPQRT",
  filename: "demo-song.mp3",
  contentType: "audio/mpeg",
  byteLength: 5,
  scoreAbc: null,
  createdAt: "2026-09-17T04:00:00.000Z",
})

test("findReferenceAudioBySongId resolves an absolute path under the media root", async () => {
  const findReferenceAudioBySongId = makeFindReferenceAudioBySongId({
    findReferenceBySongId: async () => reference,
    resolveReferenceAudioPath: (referenceId) => `/media/references/${referenceId}.mp3`,
  })

  const found = await findReferenceAudioBySongId("01J8K3R4P9ABCDEFGHJKMNPQRT")

  expect(found?.reference).toEqual(reference)
  expect(found?.audioPath).toBe(`/media/references/${reference.id}.mp3`)
})

test("findReferenceAudioBySongId is null when no reference is attached", async () => {
  const findReferenceAudioBySongId = makeFindReferenceAudioBySongId({
    findReferenceBySongId: async () => null,
    resolveReferenceAudioPath: (referenceId) => `/media/references/${referenceId}.mp3`,
  })

  expect(await findReferenceAudioBySongId("01J8K3R4P9ABCDEFGHJKMNPQRT")).toBeNull()
})
