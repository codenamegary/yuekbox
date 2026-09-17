import { err, ok, Result } from "../shared/result"
import { DeleteSongError } from "./songs.models"
import { DeleteSong } from "./songs.ports"

export type DeleteSongDeps = Readonly<{
  deleteSong: DeleteSong
}>

export const makeDeleteSong =
  (deps: DeleteSongDeps) =>
  async (songId: string): Promise<Result<null, DeleteSongError>> => {
    const deleted = await deps.deleteSong(songId)
    if (!deleted) {
      return err({ kind: "not_found" })
    }
    return ok(null)
  }
