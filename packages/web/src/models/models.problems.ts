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
 * Why a download did not start: the configured path is outside yuekbox's own
 * folder, where yuekbox refuses to write, so only a folder choice can help.
 * The download button itself is the confirmation, so a confirmation problem
 * is just an error.
 */
export type DownloadRefusal = Readonly<{ kind: "external-path"; key: ModelKey; path: string }>

export const downloadRefusalFromError = (error: unknown): DownloadRefusal | null => {
  const problem = problemFromError(error)
  if (problem === null) return null
  return problem.type === PROBLEM_TYPES.modelPathExternal
    ? { kind: "external-path", key: problem.key, path: problem.path }
    : null
}
