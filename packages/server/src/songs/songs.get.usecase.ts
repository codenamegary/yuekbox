import { Calibration } from "contracts/http/songs"
import { err, ok, Result } from "../shared/result"
import { GetSongError, Song, SongReference } from "./songs.models"
import { FindSongById } from "./songs.ports"

export type GetSongDeps = Readonly<{
  findSongById: FindSongById
  readScoreAbc: (songId: string) => Promise<string | null>
  readCalibration: (songId: string) => Promise<Calibration | null>
  findReferenceSummary: (songId: string) => Promise<SongReference | null>
}>

export const makeGetSong =
  (deps: GetSongDeps) =>
  async (songId: string): Promise<Result<Song, GetSongError>> => {
    const song = await deps.findSongById(songId)
    if (song === null) {
      return err({ kind: "not_found" })
    }

    const [scoreAbc, calibration, reference] = await Promise.all([
      deps.readScoreAbc(songId),
      deps.readCalibration(songId),
      deps.findReferenceSummary(songId),
    ])

    return ok(Object.freeze({ ...song, scoreAbc, calibration, reference }))
  }
