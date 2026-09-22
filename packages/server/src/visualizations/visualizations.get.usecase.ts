import { SongVisualization, SongVisualizationResponse } from "contracts/http/visualizations"
import { err, ok, Result } from "../shared/result"
import { FindSongById } from "../songs/songs.ports"
import { VisualizationGetError } from "./visualizations.models"
import { ReadAnalysis, ReadVisualizationCode } from "./visualizations.ports"

export type GetVisualizationDeps = Readonly<{
  findSongById: FindSongById
  readCode: ReadVisualizationCode
  readAnalysis: ReadAnalysis
  isInFlight: (songId: string) => boolean
  failureFor: (songId: string) => string | null
  checksum: (code: string) => string
}>

/**
 * The file on disk is the durable truth: when it exists the answer is ready
 * (or rerolling while a new run is in flight). Pending and failed only exist
 * while the process remembers them. The measured analysis rides along and is
 * independent of all of that.
 */
export const makeGetVisualization =
  (deps: GetVisualizationDeps) =>
  async (songId: string): Promise<Result<SongVisualizationResponse, VisualizationGetError>> => {
    const song = await deps.findSongById(songId)
    if (song === null) return err({ kind: "not_found" })

    const [code, analysis] = await Promise.all([deps.readCode(songId), deps.readAnalysis(songId)])

    let visualization: SongVisualization | null = null
    if (code !== null) {
      visualization = {
        status: deps.isInFlight(songId) ? "rerolling" : "ready",
        code,
        checksum: deps.checksum(code),
      }
    } else if (deps.isInFlight(songId)) {
      visualization = { status: "pending" }
    } else {
      const failure = deps.failureFor(songId)
      if (failure !== null) visualization = { status: "failed", errorDetail: failure }
    }

    return ok({ visualization, analysis })
  }
