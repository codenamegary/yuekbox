import { err, ok, Result } from "../shared/result"
import { OpenAIError, WriterSetting } from "./ai.models"

export const defaultTimeoutMs = 240_000

export const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/+$/, "")}${path}`

const authHeaders = (apiKey: string | null): Record<string, string> =>
  apiKey !== null && apiKey !== "" ? { authorization: `Bearer ${apiKey}` } : {}

/** Extract a human-readable message from an OpenAI-style error body. */
const errorDetail = (status: number, body: string): string => {
  try {
    const parsed: unknown = JSON.parse(body)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error?: unknown }).error === "object" &&
      (parsed as { error?: { message?: unknown } }).error !== null
    ) {
      const message = (parsed as { error: { message?: unknown } }).error.message
      if (typeof message === "string" && message.trim() !== "") {
        return `HTTP ${status}: ${message.trim()}`
      }
    }
  } catch {
    // not JSON — fall through to the raw body
  }
  const snippet = body.trim().slice(0, 300)
  return `HTTP ${status}${snippet !== "" ? `: ${snippet}` : ""}`
}

/** One chat completion against any OpenAI-compatible endpoint. */
export const chatCompletion = async (
  setting: WriterSetting,
  system: string,
  user: string,
  timeoutMs: number = defaultTimeoutMs,
): Promise<Result<string, OpenAIError>> => {
  const body: Record<string, unknown> = {
    model: setting.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  }
  if (setting.effort !== "off") {
    body.reasoning_effort = setting.effort
  }

  let response: Response
  try {
    response = await fetch(joinUrl(setting.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(setting.apiKey) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? `request timed out after ${Math.round(timeoutMs / 1000)}s`
        : error instanceof Error
          ? error.message
          : String(error)
    return err({ kind: "upstream", detail: `${setting.baseUrl} — ${message}` })
  }

  const raw = await response.text()
  if (!response.ok) {
    return err({ kind: "upstream", detail: errorDetail(response.status, raw) })
  }

  try {
    const parsed = JSON.parse(raw) as {
      choices?: ReadonlyArray<{ message?: { content?: unknown } }>
    }
    const content = parsed.choices?.[0]?.message?.content
    if (typeof content !== "string" || content.trim() === "") {
      return err({ kind: "upstream", detail: "the API replied with no message content" })
    }
    return ok(content)
  } catch {
    return err({ kind: "upstream", detail: `unparseable response: ${raw.slice(0, 300)}` })
  }
}

/** The real model list from the endpoint's /models route. */
export const listModels = async (
  setting: Pick<WriterSetting, "baseUrl" | "apiKey">,
  timeoutMs: number = 15_000,
): Promise<Result<readonly string[], OpenAIError>> => {
  let response: Response
  try {
    response = await fetch(joinUrl(setting.baseUrl, "/models"), {
      headers: authHeaders(setting.apiKey),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return err({ kind: "upstream", detail: `${setting.baseUrl} — ${message}` })
  }

  const raw = await response.text()
  if (!response.ok) {
    return err({ kind: "upstream", detail: errorDetail(response.status, raw) })
  }

  try {
    const parsed = JSON.parse(raw) as { data?: ReadonlyArray<{ id?: unknown }> }
    const models = (parsed.data ?? [])
      .map((entry) => (typeof entry?.id === "string" ? entry.id : ""))
      .filter((id) => id !== "")
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 200)
    return ok(models)
  } catch {
    return err({ kind: "upstream", detail: `unparseable /models response: ${raw.slice(0, 300)}` })
  }
}
