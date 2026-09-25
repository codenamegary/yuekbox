import { ProblemDetails, ProblemDetailsSchema } from "contracts/http/error"

/**
 * An Error that carries the parsed problem as its cause, so a caller can act on
 * the problem type instead of matching on message text.
 */
export const problemError = (problem: ProblemDetails): Error =>
  new Error(problem.detail ?? problem.title, { cause: problem })

/** The problem a thrown request error carries, when it carries one. */
export const problemFromError = (error: unknown): ProblemDetails | null => {
  if (!(error instanceof Error)) return null
  const parsed = ProblemDetailsSchema.safeParse(error.cause)
  return parsed.success ? parsed.data : null
}

/** The human message for any thrown value. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** The error for a non-ok response: the parsed problem when there is one. */
export const toProblemError = async (response: Response): Promise<Error> => {
  try {
    const parsed = ProblemDetailsSchema.safeParse(await response.json())
    if (parsed.success) return problemError(parsed.data)
  } catch {
    // fall through to a generic message
  }
  return new Error(`Request failed with status ${response.status}`)
}
