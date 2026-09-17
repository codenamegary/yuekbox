import { expect, test } from "bun:test"
import { PROBLEM_TYPES, ProblemDetailsSchema } from "./error"

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
