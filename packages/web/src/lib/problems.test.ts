import { expect, test } from "bun:test"
import { PROBLEM_TYPES } from "contracts/http/error"
import { problemError, problemFromError, toProblemError } from "./problems"

const notFound = {
  type: PROBLEM_TYPES.notFound,
  title: "Not Found",
  status: 404,
  detail: "song does not exist",
}

test("a problem error keeps the problem as its cause", () => {
  const error = problemError(notFound)
  expect(error.message).toBe("song does not exist")
  expect(problemFromError(error)).toEqual(notFound)
})

test("an error without a problem cause reads null", () => {
  expect(problemFromError(new Error("plain"))).toBeNull()
  expect(problemFromError("not an error")).toBeNull()
  expect(problemFromError(new Error("bad cause", { cause: { type: "unknown" } }))).toBeNull()
})

test("a problem response becomes an error carrying the parsed problem", async () => {
  const error = await toProblemError(Response.json(notFound, { status: 404 }))
  expect(error.message).toBe("song does not exist")
  expect(problemFromError(error)).toEqual(notFound)
})

test("a response that is not a problem falls back to the status", async () => {
  const error = await toProblemError(new Response("<html>", { status: 502 }))
  expect(error.message).toBe("Request failed with status 502")
  expect(problemFromError(error)).toBeNull()
})
