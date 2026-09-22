import { SongAnalysis } from "contracts/http/visualizations"
import {
  AiNotReadyError,
  VisualizationAuthorError,
  VisualizationAuthorInput,
} from "../ai/ai.models"
import { Result } from "../shared/result"

export type ReadVisualizationCode = (songId: string) => Promise<string | null>

export type WriteVisualizationCode = (songId: string, code: string) => Promise<number>

/** The Song's measured transcript, or null when it has none. */
export type ReadAnalysis = (songId: string) => Promise<SongAnalysis | null>

/** Yes/no guard against the visuals writer; checked before any call is spent. */
export type CanAuthorVisualizations = () => Promise<Result<null, AiNotReadyError>>

export type AuthorVisualization = (
  input: VisualizationAuthorInput,
) => Promise<Result<Readonly<{ code: string }>, VisualizationAuthorError>>
