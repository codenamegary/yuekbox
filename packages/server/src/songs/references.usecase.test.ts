import { expect, test } from "bun:test"
import { makeCreateReference } from "./references.usecase"

const referenceId = "01J8K3R4P9ABCDEFGHJKMNPQRT"
const now = "2026-09-17T04:00:00.000Z"

const makeHarness = () => {
  const puts: Array<Readonly<{ key: string; byteLength: number }>> = []
  const createReference = makeCreateReference({
    putFile: async (key, bytes) => {
      puts.push({ key, byteLength: bytes.byteLength })
      return bytes.byteLength
    },
    now: () => now,
    generateId: () => referenceId,
  })
  return { createReference, puts }
}

test("upload writes to temp and returns the reference derived from the file name", async () => {
  const harness = makeHarness()

  const result = await harness.createReference({
    filename: "Demo Song.mp3",
    contentType: "audio/mpeg",
    audio: new Uint8Array([1, 2, 3, 4]),
  })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value).toEqual({
    id: referenceId,
    filename: "Demo Song.mp3",
    contentType: "audio/mpeg",
    byteLength: 4,
    createdAt: now,
  })
  expect(harness.puts).toEqual([{ key: `temp/Demo Song_${referenceId}.mp3`, byteLength: 4 }])
})

test("upload makes unsafe characters safe and uses the canonical extension", async () => {
  const harness = makeHarness()

  const result = await harness.createReference({
    filename: "weird: name?.wav",
    contentType: "audio/flac",
    audio: new Uint8Array([1, 2]),
  })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(harness.puts[0]?.key).toBe(`temp/weird- name-_${referenceId}.flac`)
  expect(result.value.filename).toBe("weird- name-.flac")
})

test("upload rejects an invalid filename before writing anything", async () => {
  const harness = makeHarness()

  const result = await harness.createReference({
    filename: "../demo.mp3",
    contentType: "audio/mpeg",
    audio: new Uint8Array([1, 2, 3]),
  })

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("validation_error")
  expect(harness.puts).toEqual([])
})
