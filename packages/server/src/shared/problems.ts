import { PROBLEM_TYPES, ProblemError } from "contracts/http/error"
import { FastifyReply } from "fastify"

export type ProblemBody = Readonly<{
  type: string
  title: string
  status: number
  detail: string
  errors?: readonly ProblemError[]
}>

export const validationProblem = (
  errors: readonly ProblemError[],
  detail: string,
  status = 400,
): ProblemBody => ({
  type: PROBLEM_TYPES.validationError,
  title: status === 415 ? "Unsupported Media Type" : "Validation Error",
  status,
  detail,
  errors: errors.length > 0 ? errors : [{ pointer: "/", code: "invalid" }],
})

export const notFoundProblem = (detail: string): ProblemBody => ({
  type: PROBLEM_TYPES.notFound,
  title: "Not Found",
  status: 404,
  detail,
})

export const conflictProblem = (detail: string): ProblemBody => ({
  type: PROBLEM_TYPES.conflict,
  title: "Conflict",
  status: 409,
  detail,
})

export const sendProblem = (reply: FastifyReply, problem: ProblemBody) =>
  reply.status(problem.status).type("application/problem+json").send(problem)

export const issuePointer = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? "/" : `/${path.map((segment) => String(segment)).join("/")}`
