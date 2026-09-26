import { PROBLEM_TYPES, ProblemError } from "contracts/http/error"
import { MissingModel, ModelKey } from "contracts/http/models"
import {
  ConfirmationRequiredProblem,
  ModelPathExternalProblem,
  ModelRequiredProblem,
} from "contracts/http/error"
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

/** A generation gate: the named models are missing; the dialog resolves them. */
export const modelRequiredProblem = (models: readonly MissingModel[]): ModelRequiredProblem => ({
  type: PROBLEM_TYPES.modelRequired,
  title: "Model Required",
  status: 409,
  detail: "This Song needs model files that are not on disk yet.",
  models,
})

/** A download over the threshold needs the user's explicit confirmation. */
export const confirmationRequiredProblem = (
  input: Readonly<{
    expectedBytes: number
    thresholdBytes: number
  }>,
): ConfirmationRequiredProblem => ({
  type: PROBLEM_TYPES.confirmationRequired,
  title: "Confirmation Required",
  status: 409,
  detail: "This is a large download; confirm it explicitly",
  expectedBytes: input.expectedBytes,
  thresholdBytes: input.thresholdBytes,
})

/** The resolved path is outside `<home>/models`, so the user picks a folder. */
export const modelPathExternalProblem = (
  input: Readonly<{ key: ModelKey; path: string }>,
): ModelPathExternalProblem => ({
  type: PROBLEM_TYPES.modelPathExternal,
  title: "Download Unavailable",
  status: 409,
  detail: `yuekbox does not download into ${input.path}; choose a folder instead`,
  key: input.key,
  path: input.path,
})

export type ModelProblem =
  | ModelRequiredProblem
  | ConfirmationRequiredProblem
  | ModelPathExternalProblem

export const sendProblem = (reply: FastifyReply, problem: ProblemBody | ModelProblem) =>
  reply
    .status(problem.status ?? 500)
    .type("application/problem+json")
    .send(problem)

export const issuePointer = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? "/" : `/${path.map((segment) => String(segment)).join("/")}`
