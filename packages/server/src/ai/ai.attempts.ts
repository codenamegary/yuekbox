import pRetry from "p-retry"
import { err, ok, Result } from "../shared/result"
import { AiAttemptError, StoredSetting } from "./ai.models"
import { ChatCompletion } from "./ai.ports"
import { parseEnhanceText } from "./ai.prompts"
import { writerSetting } from "./ai.settings"

/** Landed songs read better with a persona; the API takes a system line. */
export const systemPrompt =
  "You are the in-house songwriter and style director for a text-to-song model. " +
  "You answer with exactly what is asked for and nothing else: no quotes, no markdown, no commentary."

export const attemptRetries = 5

type FailedAttempt = Error & Readonly<{ kind: AiAttemptError["kind"] }>

const failedAttempt = (kind: AiAttemptError["kind"], detail: string): FailedAttempt =>
  Object.assign(new Error(detail), { kind })

const isFailedAttempt = (value: unknown): value is FailedAttempt =>
  value instanceof Error &&
  "kind" in value &&
  (value.kind === "upstream_failed" || value.kind === "unusable_result")

/** One model call plus validation, before any retry policy is applied. */
export type Attempt = (
  setting: StoredSetting,
  user: string,
  /** null when the reply is usable, otherwise the reason it is not. */
  usable: (text: string) => string | null,
  /** The detail for an empty reply, which never reaches `usable`. */
  emptyDetail: string,
  system?: string,
) => Promise<Result<string, AiAttemptError>>

export const makeAttempt =
  (chat: ChatCompletion): Attempt =>
  async (setting, user, usable, emptyDetail, system) => {
    const result = await chat(writerSetting(setting), system ?? systemPrompt, user)
    if (!result.ok) {
      return err({ kind: "upstream_failed", detail: result.error.detail })
    }
    const text = parseEnhanceText(result.value)
    if (text === null) {
      return err({ kind: "unusable_result", detail: emptyDetail })
    }
    const problem = usable(text)
    if (problem !== null) {
      return err({ kind: "unusable_result", detail: problem })
    }
    return ok(text)
  }

export type RunWithRetries = (
  run: () => Promise<Result<string, AiAttemptError>>,
) => Promise<Result<string, AiAttemptError>>

/** Runs one prompt attempt, retried whenever either the call or the reply is unusable. */
export const makeRunWithRetries =
  (logError?: (message: string, error: unknown) => void): RunWithRetries =>
  async (run) => {
    try {
      const text = await pRetry(
        async () => {
          const result = await run()
          if (!result.ok) throw failedAttempt(result.error.kind, result.error.detail)
          return result.value
        },
        {
          retries: attemptRetries,
          minTimeout: 0,
          onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
            logError?.(`AI attempt ${attemptNumber} failed (${retriesLeft} retries left)`, error)
          },
        },
      )
      return ok(text)
    } catch (error) {
      if (isFailedAttempt(error)) return err({ kind: error.kind, detail: error.message })
      return err({
        kind: "upstream_failed",
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }
