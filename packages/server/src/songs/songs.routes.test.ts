import { expect, test } from "bun:test"
import { Status } from "contracts/http/status"
import { StatusSchema } from "contracts/http/status"
import { PROBLEM_TYPES, ProblemDetailsSchema } from "contracts/http/error"
import { Calibration, SongSchema, SongsCollectionSchema } from "contracts/http/songs"
import { unusedAiFixture } from "../ai/ai.fixtures"
import { buildApp } from "../app"
import { unusedConfigFixture } from "../config/config.fixtures"
import { unusedModelsFixture } from "../models/models.fixtures"
import { ModelsSlice } from "../models/models.assembly"
import { unusedReadinessFixture } from "../readiness/readiness.fixtures"
import { err, ok } from "../shared/result"
import { makeSongsSliceFixture, songFixture } from "./songs.fixtures"
import { SongsSlice } from "./songs.assembly"
import { unusedVisualizationsFixture } from "../visualizations/visualizations.fixtures"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
const queuedSong = songFixture()
const scoreAbcFixture = "X:1\nM:4/4\nL:1/8\nK:C\nV: Vocal\nc8|\n"
const calibrationFixture: Calibration = {
  cues: [{ text: "hello world", startSeconds: 12.3, endSeconds: 16.8 }],
}
const completeSong = songFixture({
  status: "complete",
  durationSeconds: 152.5,
  truncatedAbc: false,
  truncatedSemantic: false,
  scoreAbc: scoreAbcFixture,
  calibration: calibrationFixture,
  completedAt: "2026-09-17T04:05:00.000Z",
})

const statusFixture: Status = Object.freeze({
  version: "0.1.0",
  state: "online",
  ffmpeg: "ok",
  yue2: "ok",
  sheetsage2: "ok",
  queueDepth: 0,
  gpuBusy: false,
  startedAt: "2026-09-17T04:00:00.000Z",
})

const makeApp = (
  songs: SongsSlice,
  wake: () => void = () => {},
  models: ModelsSlice = unusedModelsFixture(),
) =>
  buildApp({
    songs,
    wake,
    referenceMaxBytes: 1024,
    ai: unusedAiFixture(),
    visualizations: unusedVisualizationsFixture(),
    readiness: unusedReadinessFixture(),
    models,
    config: unusedConfigFixture(),
    status: async () => statusFixture,
  })

test("create returns a queued song and wakes the worker", async () => {
  const wakes: number[] = []
  const app = makeApp(makeSongsSliceFixture(), () => {
    wakes.push(1)
  })

  const response = await app.inject({
    method: "POST",
    url: "/v1/songs",
    payload: { lyrics: "hello", style: "pop" },
  })

  expect(response.statusCode).toBe(201)
  expect(response.headers.location).toBe(`/v1/songs/${songId}`)
  expect(SongSchema.parse(response.json()).status).toBe("queued")
  expect(SongSchema.parse(response.json()).title).toBe("hello")
  expect(wakes).toHaveLength(1)
})

test("create is blocked by a model-required problem when the generator is missing", async () => {
  const createCalls: number[] = []
  const wakes: number[] = []
  const app = makeApp(
    makeSongsSliceFixture({
      createSong: async () => {
        createCalls.push(1)
        return ok(queuedSong)
      },
    }),
    () => {
      wakes.push(1)
    },
    {
      ...unusedModelsFixture(),
      findMissingGenerationModels: async () => [
        {
          key: "yue2",
          name: "YuE2-3B",
          path: "/home/u/.yuekbox/models/YuE2-3B",
          sizeBytes: 7_295_775_491,
          downloadable: true,
        },
      ],
    },
  )

  const response = await app.inject({
    method: "POST",
    url: "/v1/songs",
    payload: { lyrics: "hello", style: "pop" },
  })

  expect(response.statusCode).toBe(409)
  expect(response.headers["content-type"]).toContain("application/problem+json")
  const problem = ProblemDetailsSchema.parse(response.json())
  expect(problem.type).toBe(PROBLEM_TYPES.modelRequired)
  if (problem.type !== PROBLEM_TYPES.modelRequired) return
  expect(problem.models[0]).toEqual({
    key: "yue2",
    name: "YuE2-3B",
    path: "/home/u/.yuekbox/models/YuE2-3B",
    sizeBytes: 7_295_775_491,
    downloadable: true,
  })
  expect(createCalls).toHaveLength(0)
  expect(wakes).toHaveLength(0)
})

test("the model check asks for the reference models when a reference is attached", async () => {
  const asked: boolean[] = []
  const app = makeApp(makeSongsSliceFixture(), () => {}, {
    ...unusedModelsFixture(),
    findMissingGenerationModels: async ({ hasReference }) => {
      asked.push(hasReference)
      return []
    },
  })

  const response = await app.inject({
    method: "POST",
    url: "/v1/songs",
    payload: {
      lyrics: "hello",
      style: "pop",
      referenceId: "01J8K3R4P9ABCDEFGHJKMNPQRT",
    },
  })

  expect(response.statusCode).toBe(201)
  expect(asked).toEqual([true])
})

test("create rejects empty lyrics before any insert or wake", async () => {
  const wakes: number[] = []
  const createCalls: number[] = []
  const app = makeApp(
    makeSongsSliceFixture({
      createSong: async () => {
        createCalls.push(1)
        return ok(queuedSong)
      },
    }),
    () => {
      wakes.push(1)
    },
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
  expect(wakes).toHaveLength(0)
})

test("create rejects malformed json with a validation problem", async () => {
  const app = makeApp(makeSongsSliceFixture())

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
    makeSongsSliceFixture({
      getSong: async () => err({ kind: "not_found" }),
    }),
  )

  const response = await app.inject({ method: "GET", url: `/v1/songs/${songId}` })

  expect(response.statusCode).toBe(404)
  expect(ProblemDetailsSchema.parse(response.json()).type).toBe(PROBLEM_TYPES.notFound)
})

test("list returns a contract collection", async () => {
  const app = makeApp(
    makeSongsSliceFixture({
      listSongs: async () =>
        ok({ items: [queuedSong], limit: 20, nextCursor: null, previousCursor: null, count: 1 }),
    }),
  )

  const response = await app.inject({ method: "GET", url: "/v1/songs?limit=20" })

  expect(response.statusCode).toBe(200)
  const collection = SongsCollectionSchema.parse(response.json())
  expect(collection.items).toHaveLength(1)
  expect(collection.items[0]?.id).toBe(songId)
  expect(collection.page.count).toBe(1)
})

test("get includes the score and calibration for a complete song", async () => {
  const app = makeApp(
    makeSongsSliceFixture({
      getSong: async () => ok(completeSong),
    }),
  )

  const response = await app.inject({ method: "GET", url: `/v1/songs/${songId}` })

  expect(response.statusCode).toBe(200)
  const parsed = SongSchema.parse(response.json())
  expect(parsed.scoreAbc).toBe(scoreAbcFixture)
  expect(parsed.calibration).toEqual(calibrationFixture)
})

test("list omits the score and calibration", async () => {
  const app = makeApp(
    makeSongsSliceFixture({
      listSongs: async () =>
        ok({
          items: [completeSong],
          limit: 20,
          nextCursor: null,
          previousCursor: null,
          count: 1,
        }),
    }),
  )

  const response = await app.inject({ method: "GET", url: "/v1/songs?limit=20" })

  expect(response.statusCode).toBe(200)
  const parsed = SongSchema.parse(response.json().items[0])
  expect(parsed.scoreAbc).toBeUndefined()
  expect(parsed.calibration).toBeUndefined()
})

test("list rejects an unknown status filter", async () => {
  const app = makeApp(makeSongsSliceFixture())

  const response = await app.inject({ method: "GET", url: "/v1/songs?status=done" })

  expect(response.statusCode).toBe(400)
})

test("delete returns 204 and missing songs are not-found", async () => {
  const app = makeApp(makeSongsSliceFixture())
  const deleted = await app.inject({ method: "DELETE", url: `/v1/songs/${songId}` })
  expect(deleted.statusCode).toBe(204)

  const missingApp = makeApp(
    makeSongsSliceFixture({ deleteSong: async () => err({ kind: "not_found" }) }),
  )
  const missing = await missingApp.inject({ method: "DELETE", url: `/v1/songs/${songId}` })
  expect(missing.statusCode).toBe(404)
})

test("status returns the contract fixture", async () => {
  const app = makeApp(makeSongsSliceFixture())

  const response = await app.inject({ method: "GET", url: "/v1/status" })

  expect(response.statusCode).toBe(200)
  expect(StatusSchema.parse(response.json())).toEqual(statusFixture)
})
