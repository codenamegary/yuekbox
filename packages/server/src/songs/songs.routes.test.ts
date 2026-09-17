import { expect, test } from "bun:test"
import { Status, StatusSchema } from "contracts/http/status"
import { PROBLEM_TYPES, ProblemDetailsSchema } from "contracts/http/error"
import { SongSchema } from "contracts/http/songs"
import { SongsCollectionSchema } from "contracts/http/songs"
import { buildApp } from "../app"
import { ok } from "../shared/result"
import { SongsSlice } from "./songs.assembly"
import { Song } from "./songs.models"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

const queuedSong: Song = Object.freeze({
  id: songId,
  status: "queued",
  stage: null,
  stageCompleted: null,
  stageTotal: null,
  lyrics: "hello",
  style: "pop",
  seed: 1,
  cot: "full",
  scoreAbc: null,
  durationSeconds: null,
  truncatedAbc: null,
  truncatedSemantic: null,
  errorDetail: null,
  createdAt: "2026-09-17T04:00:00.000Z",
  updatedAt: "2026-09-17T04:00:00.000Z",
  completedAt: null,
})

const statusFixture: Status = Object.freeze({
  version: "0.1.0",
  state: "online",
  ffmpeg: "ok",
  yue2: "ok",
  queueDepth: 0,
  gpuBusy: false,
  startedAt: "2026-09-17T04:00:00.000Z",
})

const makeSlice = (overrides: Partial<SongsSlice> = {}, kicks: number[] = []): SongsSlice => ({
  createSong: async () => ok(queuedSong),
  listSongs: async () =>
    ok({ items: [queuedSong], limit: 20, nextCursor: null, previousCursor: null, count: 1 }),
  getSong: async () => ok(queuedSong),
  deleteSong: async () => ok(null),
  getSongAudio: async () => ok({ mp3: new Uint8Array([1, 2, 3]), contentType: "audio/mpeg" }),
  recoverInterruptedSongs: async () => 0,
  queueDepth: async () => 0,
  worker: {
    kick: () => {
      kicks.push(1)
    },
    drain: async () => {},
    isBusy: () => false,
  },
  ...overrides,
})

const makeApp = (slice: SongsSlice) => buildApp({ songs: slice, status: async () => statusFixture })

test("create returns a queued song and only kicks the worker", async () => {
  const kicks: number[] = []
  const app = makeApp(makeSlice({}, kicks))

  const response = await app.inject({
    method: "POST",
    url: "/v1/songs",
    payload: { lyrics: "hello", style: "pop" },
  })

  expect(response.statusCode).toBe(201)
  expect(response.headers.location).toBe(`/v1/songs/${songId}`)
  expect(SongSchema.parse(response.json()).status).toBe("queued")
  expect(kicks).toHaveLength(1)
})

test("create rejects empty lyrics before any insert or kick", async () => {
  const kicks: number[] = []
  const createCalls: number[] = []
  const app = makeApp(
    makeSlice(
      {
        createSong: async () => {
          createCalls.push(1)
          return ok(queuedSong)
        },
      },
      kicks,
    ),
  )

  const response = await app.inject({
    method: "POST",
    url: "/v1/songs",
    payload: { lyrics: "", style: "pop" },
  })

  expect(response.statusCode).toBe(400)
  expect(response.headers["content-type"]).toContain("application/problem+json")
  const problem = ProblemDetailsSchema.parse(response.json())
  expect(problem.type).toBe(PROBLEM_TYPES.validationError)
  expect(createCalls).toHaveLength(0)
  expect(kicks).toHaveLength(0)
})

test("create rejects malformed json with a validation problem", async () => {
  const app = makeApp(makeSlice())

  const response = await app.inject({
    method: "POST",
    url: "/v1/songs",
    headers: { "content-type": "application/json" },
    payload: "{not json",
  })

  expect(response.statusCode).toBe(400)
  expect(ProblemDetailsSchema.parse(response.json()).type).toBe(PROBLEM_TYPES.validationError)
})

test("unknown song id is a not-found problem", async () => {
  const app = makeApp(
    makeSlice({ getSong: async () => ({ ok: false, error: { kind: "not_found" } }) }),
  )

  const response = await app.inject({ method: "GET", url: `/v1/songs/${songId}` })

  expect(response.statusCode).toBe(404)
  expect(ProblemDetailsSchema.parse(response.json()).type).toBe(PROBLEM_TYPES.notFound)
})

test("audio before completion is a conflict problem", async () => {
  const app = makeApp(
    makeSlice({ getSongAudio: async () => ({ ok: false, error: { kind: "not_complete" } }) }),
  )

  const response = await app.inject({ method: "GET", url: `/v1/songs/${songId}/audio` })

  expect(response.statusCode).toBe(409)
  expect(ProblemDetailsSchema.parse(response.json()).type).toBe(PROBLEM_TYPES.conflict)
})

test("audio for a complete song is raw mpeg bytes", async () => {
  const app = makeApp(makeSlice())

  const response = await app.inject({ method: "GET", url: `/v1/songs/${songId}/audio` })

  expect(response.statusCode).toBe(200)
  expect(response.headers["content-type"]).toBe("audio/mpeg")
  expect(response.rawPayload).toEqual(Buffer.from([1, 2, 3]))
})

test("list returns a contract collection", async () => {
  const app = makeApp(makeSlice())

  const response = await app.inject({ method: "GET", url: "/v1/songs?limit=20" })

  expect(response.statusCode).toBe(200)
  const collection = SongsCollectionSchema.parse(response.json())
  expect(collection.items).toHaveLength(1)
  expect(collection.items[0]?.id).toBe(songId)
  expect(collection.page.count).toBe(1)
})

test("list rejects an unknown status filter", async () => {
  const app = makeApp(makeSlice())

  const response = await app.inject({ method: "GET", url: "/v1/songs?status=done" })

  expect(response.statusCode).toBe(400)
})

test("delete returns 204 and missing songs are not-found", async () => {
  const app = makeApp(makeSlice())
  const deleted = await app.inject({ method: "DELETE", url: `/v1/songs/${songId}` })
  expect(deleted.statusCode).toBe(204)

  const missingApp = makeApp(
    makeSlice({ deleteSong: async () => ({ ok: false, error: { kind: "not_found" } }) }),
  )
  const missing = await missingApp.inject({ method: "DELETE", url: `/v1/songs/${songId}` })
  expect(missing.statusCode).toBe(404)
})

test("status returns the contract fixture", async () => {
  const app = makeApp(makeSlice())

  const response = await app.inject({ method: "GET", url: "/v1/status" })

  expect(response.statusCode).toBe(200)
  expect(StatusSchema.parse(response.json())).toEqual(statusFixture)
})
