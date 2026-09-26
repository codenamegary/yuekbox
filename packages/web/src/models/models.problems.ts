import { PROBLEM_TYPES } from "contracts/http/error"
import { MissingModel, ModelKey } from "contracts/http/models"
import { problemFromError } from "@/lib/problems"

/**
 * The models a generation needs that the server says are not on disk. The
 * server owns this answer; the UI never derives a missing model on its own.
 */
export const blockedModelsFromError = (error: unknown): readonly MissingModel[] | null => {
  const problem = problemFromError(error)
  return problem !== null && problem.type === PROBLEM_TYPES.modelRequired ? problem.models : null
}

/**
 * Why a download did not start: the user still has to confirm the bytes, or
 * the configured path is outside yuekbox's own folder and only a folder choice
 * can help.
 */
export type DownloadRefusal =
  | Readonly<{ kind: "confirmation-required"; expectedBytes: number }>
  | Readonly<{ kind: "external-path"; key: ModelKey; path: string }>

export const downloadRefusalFromError = (error: unknown): DownloadRefusal | null => {
  const problem = problemFromError(error)
  if (problem === null) return null
  switch (problem.type) {
    case PROBLEM_TYPES.confirmationRequired:
      return { kind: "confirmation-required", expectedBytes: problem.expectedBytes }
    case PROBLEM_TYPES.modelPathExternal:
      return { kind: "external-path", key: problem.key, path: problem.path }
    default:
      return null
  }
}
