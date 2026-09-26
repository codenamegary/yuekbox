/** The message of any thrown value, for a failure detail or a log line. */
export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
