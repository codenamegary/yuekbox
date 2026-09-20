import { expect, test } from "bun:test"
import { PROBLEM_TYPES } from "contracts/http/error"
import { ReferenceSchema } from "contracts/http/references"
import { unusedAiFixture } from "../ai/ai.fixtures"
import { buildApp } from "../app"
import { ok } from "../shared/result"
import { makeSongsSliceFixture, referenceFixture, songFixture } from "./songs.fixtures"
import { SongsSlice } from "./songs.assembly"
import { CreateReferenceInput } from "./songs.models"

const referenceId = "01J8K3R4P9ABCDEFGHJKMNPQRT"

const reference = referenceFixture()

const makeApp = (songs: SongsSlice) =>
  buildApp({
    songs,
    wake: () => {},
    referenceMaxBytes: 1024,
    ai: unusedAiFixture(),
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
  const app = makeApp(
    makeSongsSliceFixture({
      createReference: async (input) => {
        uploaded.push(input)
        return ok(reference)
      },
    }),
  )

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
  const app = makeApp(makeSongsSliceFixture())

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
  const app = makeApp(makeSongsSliceFixture())

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
  const app = makeApp(makeSongsSliceFixture())

  const response = await app.inject({
    method: "POST",
    url: "/v1/references?filename=demo.txt",
    headers: { "content-type": "text/plain" },
    payload: "hello",
  })

  expect(response.statusCode).toBe(415)
})

test("upload surfaces slice validation failures as problems", async () => {
  const app = makeApp(
    makeSongsSliceFixture({
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
    makeSongsSliceFixture({
      createSong: async (body) => {
        bodies.push(body)
        return ok(
          songFixture({
            lyrics: body.lyrics,
            style: body.style,
            cot: "melody",
            reference: { id: referenceId, filename: "demo-song.mp3" },
          }),
        )
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
