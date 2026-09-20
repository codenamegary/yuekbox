import { expect, test } from "bun:test"
import {
  CreateSongBodySchema,
  Song,
  SongSchema,
  SongsCollectionSchema,
  SongsQuerySchema,
  songAudioPath,
  songPath,
  songsPath,
} from "./songs"

const ulid = "01J8K3R4P9ABCDEFGHJKMNPQRS"
const createdAt = "2026-09-17T04:00:00.000Z"

const completeSong: Song = {
  id: ulid,
  status: "complete",
  lyrics: "[Verse]\nhello",
  style: "warm piano pop",
  seed: 831001,
  durationSeconds: 194.2,
  truncated: { abc: false, semantic: false },
  createdAt,
  updatedAt: createdAt,
  completedAt: createdAt,
}

test("paths are plural and camelCase free", () => {
  expect(songsPath).toBe("/v1/songs")
  expect(songPath(ulid)).toBe(`/v1/songs/${ulid}`)
  expect(songAudioPath(ulid)).toBe(`/v1/songs/${ulid}/audio`)
})

test("create body trims lyrics and style", () => {
  const parsed = CreateSongBodySchema.parse({ lyrics: "  hello  ", style: "  pop  " })
  expect(parsed).toEqual({ lyrics: "hello", style: "pop" })
})

test("create body rejects empty or whitespace-only fields", () => {
  expect(CreateSongBodySchema.safeParse({ lyrics: "", style: "pop" }).success).toBe(false)
  expect(CreateSongBodySchema.safeParse({ lyrics: "   ", style: "pop" }).success).toBe(false)
  expect(CreateSongBodySchema.safeParse({ lyrics: "hi", style: "  " }).success).toBe(false)
})

test("create body rejects overlong fields and out-of-range seeds", () => {
  expect(CreateSongBodySchema.safeParse({ lyrics: "a".repeat(20001), style: "pop" }).success).toBe(
    false,
  )
  expect(CreateSongBodySchema.safeParse({ lyrics: "hi", style: "a".repeat(2001) }).success).toBe(
    false,
  )
  expect(CreateSongBodySchema.safeParse({ lyrics: "hi", style: "pop", seed: -1 }).success).toBe(
    false,
  )
  expect(
    CreateSongBodySchema.safeParse({ lyrics: "hi", style: "pop", seed: 2 ** 31 }).success,
  ).toBe(false)
  expect(CreateSongBodySchema.safeParse({ lyrics: "hi", style: "pop", seed: 0 }).success).toBe(true)
})

test("create body rejects unknown fields", () => {
  const result = CreateSongBodySchema.safeParse({ lyrics: "hi", style: "pop", cot: "full" })
  expect(result.success).toBe(false)
})

test("parses a complete song fixture", () => {
  expect(SongSchema.parse(completeSong)).toEqual(completeSong)
})

test("parses a complete song that carries its score", () => {
  const withScore: Song = { ...completeSong, scoreAbc: "X:1\nM:4/4\nL:1/8\nK:C\nV: Vocal\nc8|\n" }
  expect(SongSchema.parse(withScore)).toEqual(withScore)
})

test("rejects a score on a song that is not complete", () => {
  const queued: Song = {
    id: ulid,
    status: "queued",
    lyrics: "hi",
    style: "pop",
    seed: 1,
    createdAt,
    updatedAt: createdAt,
  }
  expect(SongSchema.safeParse({ ...queued, scoreAbc: "X:1" }).success).toBe(false)
})

test("parses a running song fixture with a stage", () => {
  const running: Song = {
    id: ulid,
    status: "running",
    stage: "synthesize",
    lyrics: "hi",
    style: "pop",
    seed: 1,
    createdAt,
    updatedAt: createdAt,
  }
  expect(SongSchema.parse(running)).toEqual(running)
})

test("parses a running song fixture with stage progress", () => {
  const running: Song = {
    id: ulid,
    status: "running",
    stage: "synthesize",
    stageProgress: { completed: 12, total: 40 },
    lyrics: "hi",
    style: "pop",
    seed: 1,
    createdAt,
    updatedAt: createdAt,
  }
  expect(SongSchema.parse(running)).toEqual(running)
})

test("rejects stage progress outside a running song", () => {
  const result = SongSchema.safeParse({
    ...completeSong,
    stageProgress: { completed: 1, total: 2 },
  })
  expect(result.success).toBe(false)
})

test("rejects stage progress that exceeds its total", () => {
  const result = SongSchema.safeParse({
    id: ulid,
    status: "running",
    stage: "decode",
    stageProgress: { completed: 9, total: 8 },
    lyrics: "hi",
    style: "pop",
    seed: 1,
    createdAt,
    updatedAt: createdAt,
  })
  expect(result.success).toBe(false)
})

test("parses a queued song fixture without a stage", () => {
  const queued: Song = {
    id: ulid,
    status: "queued",
    lyrics: "hi",
    style: "pop",
    seed: 1,
    createdAt,
    updatedAt: createdAt,
  }
  expect(SongSchema.parse(queued)).toEqual(queued)
})

test("parses a failed song fixture with an error detail", () => {
  const failed: Song = {
    id: ulid,
    status: "failed",
    lyrics: "hi",
    style: "pop",
    seed: 1,
    errorDetail: "encode: ffmpeg exited 1",
    createdAt,
    updatedAt: createdAt,
    completedAt: createdAt,
  }
  expect(SongSchema.parse(failed)).toEqual(failed)
})

test("rejects status-shape mismatches", () => {
  expect(SongSchema.safeParse({ ...completeSong, stage: "encode" }).success).toBe(false)
  expect(
    SongSchema.safeParse({ ...completeSong, status: "running", stage: undefined }).success,
  ).toBe(false)
  expect(SongSchema.safeParse({ ...completeSong, errorDetail: "boom" }).success).toBe(false)
  expect(
    SongSchema.safeParse({ ...completeSong, durationSeconds: undefined, truncated: undefined })
      .success,
  ).toBe(false)
  expect(SongSchema.safeParse({ ...completeSong, completedAt: undefined }).success).toBe(false)
})

test("query applies the default limit and coerces the wire string", () => {
  expect(SongsQuerySchema.parse({})).toEqual({ limit: 20 })
  expect(SongsQuerySchema.parse({ limit: "5" })).toEqual({ limit: 5 })
})

test("query normalizes a single repeated status value", () => {
  expect(SongsQuerySchema.parse({ status: "queued" })).toEqual({ limit: 20, status: ["queued"] })
  expect(SongsQuerySchema.parse({ status: ["queued", "running"] })).toEqual({
    limit: 20,
    status: ["queued", "running"],
  })
})

test("query rejects an oversized limit and unknown status", () => {
  expect(SongsQuerySchema.safeParse({ limit: "101" }).success).toBe(false)
  expect(SongsQuerySchema.safeParse({ status: "done" }).success).toBe(false)
})

test("parses a songs collection fixture", () => {
  const fixture = {
    items: [completeSong],
    page: { limit: 20, nextCursor: "cursor-a", count: 1 },
  }
  expect(SongsCollectionSchema.parse(fixture)).toEqual(fixture)
})

test("create body accepts an optional reference id", () => {
  const parsed = CreateSongBodySchema.parse({
    lyrics: "hi",
    style: "jazz",
    referenceId: ulid,
  })
  expect(parsed.referenceId).toBe(ulid)
  expect(
    CreateSongBodySchema.safeParse({ lyrics: "hi", style: "jazz", referenceId: "nope" }).success,
  ).toBe(false)
})

test("a cover song carries its reference summary and a transcribe stage", () => {
  const cover: Song = {
    ...completeSong,
    reference: { id: ulid, filename: "demo-song.mp3" },
  }
  expect(SongSchema.parse(cover)).toEqual(cover)

  const running: Song = {
    id: ulid,
    status: "running",
    stage: "transcribe",
    lyrics: "hi",
    style: "jazz",
    seed: 1,
    createdAt,
    updatedAt: createdAt,
  }
  expect(SongSchema.parse(running)).toEqual(running)
})

test("rejects a reference summary without a filename", () => {
  const result = SongSchema.safeParse({ ...completeSong, reference: { id: ulid } })
  expect(result.success).toBe(false)
})
