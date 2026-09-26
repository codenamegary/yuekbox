import { expect, test } from "bun:test"
import { ProblemDetailsSchema, PROBLEM_TYPES } from "contracts/http/error"
import { ModelDownloadSnapshotSchema, ModelDownloadsSchema } from "contracts/http/models"
import Fastify from "fastify"
import { ok, Result } from "../shared/result"
import { ModelDownloads } from "./models.downloads"
import { ModelDownloadKey, ModelDownloadSnapshot, StartModelDownloadError } from "./models.models"
import { modelsRoutes } from "./models.routes"

const modelPath = "/home/u/.yuekbox/models/YuE2-3B"

const downloading: ModelDownloadSnapshot = Object.freeze({
  key: "yue2",
  state: "downloading",
  path: modelPath,
  totalBytes: 7_295_775_491,
  bytesDone: 1_048_576,
  currentFile: "model.safetensors",
})

type StartResult = Result<ModelDownloadSnapshot, StartModelDownloadError>

const otherSnapshot: ModelDownloadSnapshot = { ...downloading, key: "yue2Vae" }

const makeDownloads = (overrides: Partial<ModelDownloads> = {}): ModelDownloads => ({
  start: async (): Promise<StartResult> => ok(downloading),
  read: async (key: ModelDownloadKey) => ({ ...downloading, key }),
  readAll: async () => Object.freeze([downloading, otherSnapshot]),
  drain: async () => {},
  ...overrides,
})

const makeApp = (downloads: ModelDownloads) => {
  const app = Fastify()
  app.register(modelsRoutes, { downloads })
  return app
}

test("GET /v1/models/downloads answers the contract list", async () => {
  const app = makeApp(makeDownloads())

  const response = await app.inject({ method: "GET", url: "/v1/models/downloads" })

  expect(response.statusCode).toBe(200)
  const parsed = ModelDownloadsSchema.parse(response.json())
  expect(parsed.map((item) => item.key)).toEqual(["yue2", "yue2Vae"])
  await app.close()
})

test("GET /v1/models/:key/download answers one snapshot and 404s an unknown key", async () => {
  const app = makeApp(makeDownloads())

  const found = await app.inject({ method: "GET", url: "/v1/models/yue2/download" })
  expect(found.statusCode).toBe(200)
  expect(ModelDownloadSnapshotSchema.parse(found.json()).key).toBe("yue2")

  const unknown = await app.inject({ method: "GET", url: "/v1/models/yue3/download" })
  expect(unknown.statusCode).toBe(404)
  await app.close()
})

test("POST starts a download and answers 202 with the running snapshot", async () => {
  const starts: Array<{ key: string; confirm: boolean }> = []
  const app = makeApp(
    makeDownloads({
      start: async (input) => {
        starts.push(input)
        return ok(downloading)
      },
    }),
  )

  const response = await app.inject({
    method: "POST",
    url: "/v1/models/yue2/download",
    payload: { confirm: true },
  })

  expect(response.statusCode).toBe(202)
  expect(starts).toEqual([{ key: "yue2", confirm: true }])
  expect(ModelDownloadSnapshotSchema.parse(response.json()).state).toBe("downloading")
  await app.close()
})

test("POST for an already present model answers 200", async () => {
  const app = makeApp(
    makeDownloads({
      start: async () =>
        ok({ ...downloading, state: "present", bytesDone: downloading.totalBytes }),
    }),
  )

  const response = await app.inject({
    method: "POST",
    url: "/v1/models/yue2/download",
    payload: { confirm: true },
  })

  expect(response.statusCode).toBe(200)
  await app.close()
})

test("POST without a confirmation carries the expected bytes in a 409 problem", async () => {
  const app = makeApp(
    makeDownloads({
      start: async () => ({
        ok: false,
        error: {
          kind: "confirmation_required",
          key: "yue2",
          expectedBytes: 7_295_775_491,
          thresholdBytes: 134_217_728,
        },
      }),
    }),
  )

  const response = await app.inject({
    method: "POST",
    url: "/v1/models/yue2/download",
    payload: {},
  })

  expect(response.statusCode).toBe(409)
  const problem = ProblemDetailsSchema.parse(response.json())
  expect(problem.type).toBe(PROBLEM_TYPES.confirmationRequired)
  if (problem.type !== PROBLEM_TYPES.confirmationRequired) return
  expect(problem.expectedBytes).toBe(7_295_775_491)
  expect(problem.thresholdBytes).toBe(134_217_728)
  await app.close()
})

test("POST for a path outside the home steers to choosing a folder", async () => {
  const app = makeApp(
    makeDownloads({
      start: async () => ({
        ok: false,
        error: { kind: "path_outside_home", key: "yue2", path: "/mnt/audio/YuE2-3B" },
      }),
    }),
  )

  const response = await app.inject({
    method: "POST",
    url: "/v1/models/yue2/download",
    payload: { confirm: true },
  })

  expect(response.statusCode).toBe(409)
  const problem = ProblemDetailsSchema.parse(response.json())
  expect(problem.type).toBe(PROBLEM_TYPES.modelPathExternal)
  if (problem.type !== PROBLEM_TYPES.modelPathExternal) return
  expect(problem.path).toBe("/mnt/audio/YuE2-3B")
  await app.close()
})

test("POST rejects an unknown key and a malformed body", async () => {
  const app = makeApp(makeDownloads())

  const unknown = await app.inject({
    method: "POST",
    url: "/v1/models/yue3/download",
    payload: { confirm: true },
  })
  expect(unknown.statusCode).toBe(404)

  const malformed = await app.inject({
    method: "POST",
    url: "/v1/models/yue2/download",
    payload: { confirm: "yes" },
  })
  expect(malformed.statusCode).toBe(400)
  expect(ProblemDetailsSchema.parse(malformed.json()).type).toBe(PROBLEM_TYPES.validationError)
  await app.close()
})
