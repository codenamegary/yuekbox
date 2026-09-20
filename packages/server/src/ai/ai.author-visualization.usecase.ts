import { err, ok, Result } from "../shared/result"
import { makeAttempt, makeRunWithRetries } from "./ai.attempts"
import { VisualizationAuthorError, VisualizationAuthorInput } from "./ai.models"
import { ChatCompletion, LoadStoredConfig } from "./ai.ports"
import { checkSetting } from "./ai.settings"
import { normalizeVisualizationCode, smokeVisualization } from "./ai.visualization.code"
import { buildVisualizationPrompt, visualizationSystemPrompt } from "./ai.visualization.prompts"

export type AuthorVisualizationDeps = Readonly<{
  loadStoredConfig: LoadStoredConfig
  chat: ChatCompletion
  logError?: (message: string, error: unknown) => void
}>

const emptyDetail = "the model replied with nothing"
const notAFunctionDetail = "the model's reply was not a JavaScript function"

/** A reply is usable when it normalizes to a function that survives a smoke run. */
const usabilityProblem = (text: string): string | null => {
  const code = normalizeVisualizationCode(text)
  if (code === null) return notAFunctionDetail
  const smoke = smokeVisualization(code)
  return smoke.ok ? null : smoke.detail
}

/** Authors one canvas factory from a Song's style and lyrics. */
export const makeAuthorVisualization =
  (deps: AuthorVisualizationDeps) =>
  async (
    input: VisualizationAuthorInput,
  ): Promise<Result<Readonly<{ code: string }>, VisualizationAuthorError>> => {
    const attempt = makeAttempt(deps.chat)
    const runWithRetries = makeRunWithRetries(deps.logError)

    const guarded = checkSetting(await deps.loadStoredConfig(), "visuals")
    if (!guarded.ok) return guarded

    const authoring = await runWithRetries(() =>
      attempt(
        guarded.value,
        buildVisualizationPrompt(input),
        usabilityProblem,
        emptyDetail,
        visualizationSystemPrompt,
      ),
    )
    if (!authoring.ok) return authoring

    const code = normalizeVisualizationCode(authoring.value)
    if (code === null) return err({ kind: "unusable_result", detail: notAFunctionDetail })

    return ok({ code })
  }
