import { err, ok, Result } from "../shared/result"
import { GetSongError, Song } from "./songs.models"
import { FindSongById } from "./songs.ports"

export type GetSongDeps = Readonly<{
  findSongById: FindSongById
}>

export const makeGetSong =
  (deps: GetSongDeps) =>
  async (songId: string): Promise<Result<Song, GetSongError>> => {
    const song = await deps.findSongById(songId)
    if (song === null) {
      return err({ kind: "not_found" })
    }
    return ok(song)
  }
