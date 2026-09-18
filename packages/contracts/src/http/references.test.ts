import { expect, test } from "bun:test"
import {
  Reference,
  ReferenceSchema,
  ReferenceSummarySchema,
  ReferenceUploadQuerySchema,
  referencePath,
  referencesPath,
} from "./references"

const ulid = "01J8K3R4P9ABCDEFGHJKMNPQRS"
const createdAt = "2026-09-17T04:00:00.000Z"

test("reference paths are plural and camelCase free", () => {
  expect(referencesPath).toBe("/v1/references")
  expect(referencePath(ulid)).toBe(`/v1/references/${ulid}`)
})

test("parses a reference fixture", () => {
  const fixture: Reference = {
    id: ulid,
    filename: "demo-song.mp3",
    contentType: "audio/mpeg",
    byteLength: 4096,
    createdAt,
  }
  expect(ReferenceSchema.parse(fixture)).toEqual(fixture)
})

test("upload query keeps a plain filename", () => {
  expect(ReferenceUploadQuerySchema.parse({ filename: " demo-song.mp3 " })).toEqual({
    filename: "demo-song.mp3",
  })
})

test("upload query rejects path separators and empty names", () => {
  expect(ReferenceUploadQuerySchema.safeParse({ filename: "../etc/passwd" }).success).toBe(false)
  expect(ReferenceUploadQuerySchema.safeParse({ filename: "a/b.mp3" }).success).toBe(false)
  expect(ReferenceUploadQuerySchema.safeParse({ filename: "a\\b.mp3" }).success).toBe(false)
  expect(ReferenceUploadQuerySchema.safeParse({ filename: "   " }).success).toBe(false)
  expect(ReferenceUploadQuerySchema.safeParse({}).success).toBe(false)
})

test("summary carries only id and filename", () => {
  expect(ReferenceSummarySchema.parse({ id: ulid, filename: "demo.wav" })).toEqual({
    id: ulid,
    filename: "demo.wav",
  })
  expect(
    ReferenceSummarySchema.safeParse({ id: ulid, filename: "demo.wav", size: 1 }).success,
  ).toBe(false)
})
