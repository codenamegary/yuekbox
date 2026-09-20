import { err, ok, Result } from "../shared/result"
import { DeleteSongError } from "./songs.models"
import { DeleteSong } from "./songs.ports"

export type DeleteSongDeps = Readonly<{
  deleteSong: DeleteSong
  removeSongFolder: (songId: string) => Promise<void>
  logError: (message: string, error: unknown) => void
}>

export const makeDeleteSong =
  (deps: DeleteSongDeps) =>
  async (songId: string): Promise<Result<null, DeleteSongError>> => {
    const [deleted] = await Promise.all([
      deps.deleteSong(songId),
      deps.removeSongFolder(songId).catch((error: unknown) => {
        deps.logError("song folder removal failed", error)
      }),
    ])

    if (!deleted) {
      return err({ kind: "not_found" })
    }
    return ok(null)
  }
