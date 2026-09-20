import { SongVisualization } from "contracts/http/visualizations"
import { err, ok, Result } from "../shared/result"
import { FindSongById } from "../songs/songs.ports"
import { VisualizationGetError } from "./visualizations.models"
import { ReadVisualizationCode } from "./visualizations.ports"

export type GetVisualizationDeps = Readonly<{
  findSongById: FindSongById
  readCode: ReadVisualizationCode
  isInFlight: (songId: string) => boolean
  failureFor: (songId: string) => string | null
  checksum: (code: string) => string
}>

/**
 * The file on disk is the durable truth: when it exists the answer is ready
 * (or rerolling while a new run is in flight). Pending and failed only exist
 * while the process remembers them.
 */
export const makeGetVisualization =
  (deps: GetVisualizationDeps) =>
  async (songId: string): Promise<Result<SongVisualization, VisualizationGetError>> => {
    const song = await deps.findSongById(songId)
    if (song === null) return err({ kind: "not_found" })

    const code = await deps.readCode(songId)
    if (code !== null) {
      return ok({
        status: deps.isInFlight(songId) ? "rerolling" : "ready",
        code,
        checksum: deps.checksum(code),
      })
    }

    if (deps.isInFlight(songId)) return ok({ status: "pending" })

    const failure = deps.failureFor(songId)
    if (failure !== null) return ok({ status: "failed", errorDetail: failure })

    return err({ kind: "not_found" })
  }
