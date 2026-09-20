import { expect, test } from "bun:test"
import { PROBLEM_TYPES } from "contracts/http/error"
import { ReferenceSchema } from "contracts/http/references"
import { AiSlice } from "../ai/ai.models"
import { buildApp } from "../app"
import { ok } from "../shared/result"
import { CreateReferenceInput, Reference } from "./songs.models"
import { SongsSlice } from "./songs.assembly"

const referenceId = "01J8K3R4P9ABCDEFGHJKMNPQRT"
const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

const reference: Reference = Object.freeze({
  id: referenceId,
  songId: null,
  filename: "demo-song.mp3",
  contentType: "audio/mpeg",
  byteLength: 4,
  audioPath: `references/${referenceId}.mp3`,
  scoreAbc: null,
  createdAt: "2026-09-17T04:00:00.000Z",
})

const makeSlice = (
  overrides: Partial<SongsSlice> = {},
  uploaded: CreateReferenceInput[] = [],
): SongsSlice => ({
  createSong: async () => ok(null as never),
  createReference: async (input) => {
    uploaded.push(input)
    return ok(reference)
  },
  listSongs: async () =>
    ok({ items: [], limit: 20, nextCursor: null, previousCursor: null, count: 0 }),
  getSong: async () => ok(null as never),
  deleteSong: async () => ok(null),
  getSongAudio: async () =>
    ok({ contentType: "audio/mpeg", byteLength: 0, read: async () => new Uint8Array() }),
  recoverInterruptedSongs: async () => 0,
  reconcileMedia: async () => ({
    removedOrphanFiles: 0,
    failedSongIds: [],
    missingReferenceCount: 0,
  }),
  purgeStaleReferences: async () => 0,
  queueDepth: async () => 0,
  worker: { kick: () => {}, drain: async () => {}, isBusy: () => false },
  ...overrides,
})

/** These tests exercise reference routes, so every AI port throws if it is ever called. */
const unusedAi: AiSlice = {
  listPresets: () => [],
  getConfig: async () => {
    throw new Error("references tests never call the AI slice")
  },
  saveConfig: async () => {
    throw new Error("references tests never call the AI slice")
  },
  fetchModels: async () => {
    throw new Error("references tests never call the AI slice")
  },
  enhance: async () => {
    throw new Error("references tests never call the AI slice")
  },
  randomSong: async () => {
    throw new Error("references tests never call the AI slice")
  },
}

const makeApp = (slice: SongsSlice) =>
  buildApp({
    songs: slice,
    referenceMaxBytes: 1024,
    ai: unusedAi,
    status: async () => ({
      version: "0.1.0",
      state: "online",
      ffmpeg: "ok",
      yue2: "ok",
      sheetsage2: "ok",
      queueDepth: 0,
      gpuBusy: false,
      startedAt: "2026-09-17T04:00:00.000Z",
    }),
  })

test("upload stores audio bytes with the filename and returns a reference", async () => {
  const uploaded: CreateReferenceInput[] = []
  const app = makeApp(makeSlice({}, uploaded))

  const response = await app.inject({
    method: "POST",
    url: "/v1/references?filename=demo-song.mp3",
    headers: { "content-type": "audio/mpeg" },
    payload: Buffer.from([1, 2, 3, 4]),
  })

  expect(response.statusCode).toBe(201)
  expect(response.headers.location).toBe(`/v1/references/${referenceId}`)
  expect(ReferenceSchema.parse(response.json())).toEqual({
    id: referenceId,
    filename: "demo-song.mp3",
    contentType: "audio/mpeg",
    byteLength: 4,
    createdAt: "2026-09-17T04:00:00.000Z",
  })
  expect(uploaded).toHaveLength(1)
  expect(uploaded[0]?.filename).toBe("demo-song.mp3")
  expect(Array.from(uploaded[0]?.audio ?? [])).toEqual([1, 2, 3, 4])
})

test("upload rejects a filename with a path separator", async () => {
  const app = makeApp(makeSlice())

  const response = await app.inject({
    method: "POST",
    url: "/v1/references?filename=../demo.mp3",
    headers: { "content-type": "audio/mpeg" },
    payload: Buffer.from([1, 2, 3, 4]),
  })

  expect(response.statusCode).toBe(400)
  expect(response.json().type).toBe(PROBLEM_TYPES.validationError)
})

test("upload rejects an empty body", async () => {
  const app = makeApp(makeSlice())

  const response = await app.inject({
    method: "POST",
    url: "/v1/references?filename=demo.mp3",
    headers: { "content-type": "audio/mpeg" },
    payload: Buffer.alloc(0),
  })

  expect(response.statusCode).toBe(400)
  expect(response.json().type).toBe(PROBLEM_TYPES.validationError)
})

test("upload rejects a non-audio content type", async () => {
  const app = makeApp(makeSlice())

  const response = await app.inject({
    method: "POST",
    url: "/v1/references?filename=demo.txt",
    headers: { "content-type": "text/plain" },
    payload: "hello",
  })

  expect(response.statusCode).toBe(415)
})

test("upload rejects a reference id that cannot attach", async () => {
  const app = makeApp(
    makeSlice({
      createReference: async () => ({
        ok: false,
        error: { kind: "validation_error", pointer: "/filename", code: "too_big" },
      }),
    }),
  )

  const response = await app.inject({
    method: "POST",
    url: "/v1/references?filename=demo.mp3",
    headers: { "content-type": "audio/mpeg" },
    payload: Buffer.from([1, 2, 3, 4]),
  })

  expect(response.statusCode).toBe(400)
})

test("create forwards a reference id to the slice", async () => {
  const bodies: unknown[] = []
  const app = makeApp(
    makeSlice({
      createSong: async (body) => {
        bodies.push(body)
        return ok({
          id: songId,
          status: "queued",
          stage: null,
          stageCompleted: null,
          stageTotal: null,
          lyrics: body.lyrics,
          style: body.style,
          seed: 1,
          cot: "melody",
          reference: { id: referenceId, filename: "demo-song.mp3" },
          scoreAbc: null,
          durationSeconds: null,
          truncatedAbc: null,
          truncatedSemantic: null,
          errorDetail: null,
          createdAt: "2026-09-17T04:00:00.000Z",
          updatedAt: "2026-09-17T04:00:00.000Z",
          completedAt: null,
        })
      },
    }),
  )

  const response = await app.inject({
    method: "POST",
    url: "/v1/songs",
    payload: { lyrics: "hello", style: "jazz", referenceId },
  })

  expect(response.statusCode).toBe(201)
  expect(bodies).toEqual([{ lyrics: "hello", style: "jazz", referenceId }])
  expect(response.json().reference).toEqual({ id: referenceId, filename: "demo-song.mp3" })
})
