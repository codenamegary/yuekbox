import { err, ok, Result } from "../shared/result"
import { Song } from "../songs/songs.models"
import { FindSongById } from "../songs/songs.ports"
import { VisualizationRequestError } from "./visualizations.models"
import { CanAuthorVisualizations } from "./visualizations.ports"

export type RequestVisualizationDeps = Readonly<{
  findSongById: FindSongById
  canAuthor: CanAuthorVisualizations
  start: (song: Song) => void
}>

/**
 * Kicks authoring for one Song. A run already in flight absorbs the request,
 * and a run that has been asked for while the writer is not ready is refused
 * before any pending state exists.
 */
export const makeRequestVisualization =
  (deps: RequestVisualizationDeps) =>
  async (songId: string): Promise<Result<null, VisualizationRequestError>> => {
    const song = await deps.findSongById(songId)
    if (song === null) return err({ kind: "not_found" })

    const allowed = await deps.canAuthor()
    if (!allowed.ok) return err(allowed.error)

    deps.start(song)
    return ok(null)
  }
