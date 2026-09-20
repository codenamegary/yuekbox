import { SongVisualization } from "contracts/http/visualizations"
import { Result } from "../shared/result"
import { FindSongById } from "../songs/songs.ports"
import { makeVisualizationAuthoring } from "./visualizations.authoring"
import { visualizationChecksum } from "./visualizations.checksum"
import { makeGetVisualization } from "./visualizations.get.usecase"
import { VisualizationGetError, VisualizationRequestError } from "./visualizations.models"
import {
  AuthorVisualization,
  CanAuthorVisualizations,
  ReadVisualizationCode,
  WriteVisualizationCode,
} from "./visualizations.ports"
import { makeRequestVisualization } from "./visualizations.request.usecase"

export type VisualizationsSliceDeps = Readonly<{
  findSongById: FindSongById
  readVisualizationFile: ReadVisualizationCode
  writeVisualizationFile: WriteVisualizationCode
  canAuthorVisualizations: CanAuthorVisualizations
  authorVisualization: AuthorVisualization
  logError?: (message: string, error: unknown) => void
}>

export type VisualizationsSlice = Readonly<{
  getVisualization: (songId: string) => Promise<Result<SongVisualization, VisualizationGetError>>
  requestVisualization: (songId: string) => Promise<Result<null, VisualizationRequestError>>
  /** Test seam: waits for every authoring run this process has started. */
  drain: () => Promise<void>
}>

export const assembleVisualizationsSlice = (deps: VisualizationsSliceDeps): VisualizationsSlice => {
  const authoring = makeVisualizationAuthoring({
    author: deps.authorVisualization,
    writeFile: deps.writeVisualizationFile,
    logError: deps.logError,
  })

  return {
    getVisualization: makeGetVisualization({
      findSongById: deps.findSongById,
      readCode: deps.readVisualizationFile,
      isInFlight: authoring.isInFlight,
      failureFor: authoring.failureFor,
      checksum: visualizationChecksum,
    }),
    requestVisualization: makeRequestVisualization({
      findSongById: deps.findSongById,
      canAuthor: deps.canAuthorVisualizations,
      start: authoring.start,
    }),
    drain: authoring.drain,
  }
}
