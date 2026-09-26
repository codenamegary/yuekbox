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

/** A stored code wins, then an in-flight run, then the last failure, else nothing. */
const visualizationFor = (
  deps: GetVisualizationDeps,
  songId: string,
  code: string | null,
): SongVisualization | null => {
  if (code !== null) {
    return {
      status: deps.isInFlight(songId) ? "rerolling" : "ready",
      code,
      checksum: deps.checksum(code),
    }
  }
  if (deps.isInFlight(songId)) return { status: "pending" }
  const failure = deps.failureFor(songId)
  return failure === null ? null : { status: "failed", errorDetail: failure }
}

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

    const visualization = visualizationFor(deps, songId, code)

    return ok({ visualization, analysis })
  }
