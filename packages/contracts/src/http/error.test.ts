import { expect, test } from "bun:test"
import {
  ConfirmationRequiredProblem,
  ModelPathExternalProblem,
  ModelRequiredProblem,
  PROBLEM_TYPES,
  ProblemDetailsSchema,
} from "./error"

test("parses a validation problem fixture", () => {
  const fixture = {
    type: PROBLEM_TYPES.validationError,
    title: "Validation Error",
    status: 400,
    detail: "body/lyrics: too small",
    instance: "/v1/songs",
    errors: [{ pointer: "/lyrics", code: "too_small" }],
  }
  expect(ProblemDetailsSchema.parse(fixture)).toEqual(fixture)
})

test("parses not-found and conflict fixtures", () => {
  const notFound = {
    type: PROBLEM_TYPES.notFound,
    title: "Not Found",
    status: 404,
    detail: "song not found",
  }
  const conflict = {
    type: PROBLEM_TYPES.conflict,
    title: "Conflict",
    status: 409,
    detail: "song is not complete",
  }
  expect(ProblemDetailsSchema.parse(notFound)).toEqual(notFound)
  expect(ProblemDetailsSchema.parse(conflict)).toEqual(conflict)
})

test("parses a model-required problem naming the missing models", () => {
  const fixture: ModelRequiredProblem = {
    type: PROBLEM_TYPES.modelRequired,
    title: "Model Required",
    status: 409,
    detail: "This Song needs model files that are not on disk yet.",
    models: [
      {
        key: "yue2",
        name: "YuE2-3B",
        path: "/home/u/.yuekbox/models/YuE2-3B",
        sizeBytes: 7_295_775_491,
        downloadable: true,
      },
    ],
  }
  expect(ProblemDetailsSchema.parse(fixture)).toEqual(fixture)
})

test("parses a download confirmation problem and a blocked external path", () => {
  const confirmation: ConfirmationRequiredProblem = {
    type: PROBLEM_TYPES.confirmationRequired,
    title: "Confirmation Required",
    status: 409,
    detail: "YuE2-3B is a 7.3 GB download.",
    expectedBytes: 7_295_775_491,
    thresholdBytes: 134_217_728,
  }
  const external: ModelPathExternalProblem = {
    type: PROBLEM_TYPES.modelPathExternal,
    title: "Download Unavailable",
    status: 409,
    detail: "The YuE2-3B folder is outside yuekbox's home.",
    key: "yue2",
    path: "/mnt/audio/YuE2-3B",
  }
  expect(ProblemDetailsSchema.parse(confirmation)).toEqual(confirmation)
  expect(ProblemDetailsSchema.parse(external)).toEqual(external)
})

test("rejects a model-required problem with no models", () => {
  const result = ProblemDetailsSchema.safeParse({
    type: PROBLEM_TYPES.modelRequired,
    title: "Model Required",
    models: [],
  })
  expect(result.success).toBe(false)
})

test("rejects an unknown problem type", () => {
  const result = ProblemDetailsSchema.safeParse({
    type: "https://yuekbox.local/problems/teapot",
    title: "Teapot",
  })
  expect(result.success).toBe(false)
})

test("rejects a validation problem without errors", () => {
  const result = ProblemDetailsSchema.safeParse({
    type: PROBLEM_TYPES.validationError,
    title: "Validation Error",
  })
  expect(result.success).toBe(false)
})
