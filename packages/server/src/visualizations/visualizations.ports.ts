import {
  AiNotReadyError,
  VisualizationAuthorError,
  VisualizationAuthorInput,
} from "../ai/ai.models"
import { Result } from "../shared/result"

export type ReadVisualizationCode = (songId: string) => Promise<string | null>

export type WriteVisualizationCode = (songId: string, code: string) => Promise<number>

/** Yes/no guard against the visuals writer; checked before any call is spent. */
export type CanAuthorVisualizations = () => Promise<Result<null, AiNotReadyError>>

export type AuthorVisualization = (
  input: VisualizationAuthorInput,
) => Promise<Result<Readonly<{ code: string }>, VisualizationAuthorError>>
