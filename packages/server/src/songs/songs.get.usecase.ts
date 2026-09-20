import { err, ok, Result } from "../shared/result"
import { GetSongError, Song, SongReference } from "./songs.models"
import { FindSongById } from "./songs.ports"

export type GetSongDeps = Readonly<{
  findSongById: FindSongById
  readScoreAbc: (songId: string) => Promise<string | null>
  findReferenceSummary: (songId: string) => Promise<SongReference | null>
}>

export const makeGetSong =
  (deps: GetSongDeps) =>
  async (songId: string): Promise<Result<Song, GetSongError>> => {
    const song = await deps.findSongById(songId)
    if (song === null) {
      return err({ kind: "not_found" })
    }

    const [scoreAbc, reference] = await Promise.all([
      deps.readScoreAbc(songId),
      deps.findReferenceSummary(songId),
    ])

    return ok(Object.freeze({ ...song, scoreAbc, reference }))
  }
