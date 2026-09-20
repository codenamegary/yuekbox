import { AiNotReadyError } from "../ai/ai.models"

/** Nothing authored and nothing in flight: the Song simply has no visualization. */
export type VisualizationGetError = Readonly<{ kind: "not_found" }>

export type VisualizationRequestError = Readonly<{ kind: "not_found" } | AiNotReadyError>

export const visualizationErrorDetailLimit = 2000

export const visualizationErrorDetail = (value: string): string =>
  value.trim().slice(0, visualizationErrorDetailLimit) || "unknown error"
