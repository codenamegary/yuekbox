import { err, ok, Result } from "../shared/result"
import { DeleteSongError } from "./songs.models"
import { DeleteSong, FindReferenceBySongId } from "./songs.ports"

export type DeleteSongDeps = Readonly<{
  deleteSong: DeleteSong
  findReferenceBySongId: FindReferenceBySongId
  removeSongMedia: (songId: string) => Promise<void>
  removeReferenceMedia: (referenceId: string) => Promise<void>
}>

export const makeDeleteSong =
  (deps: DeleteSongDeps) =>
  async (songId: string): Promise<Result<null, DeleteSongError>> => {
    const reference = await deps.findReferenceBySongId(songId)
    const deleted = await deps.deleteSong(songId)
    if (!deleted) {
      return err({ kind: "not_found" })
    }
    await deps.removeSongMedia(songId)
    if (reference !== null) {
      await deps.removeReferenceMedia(reference.id)
    }
    return ok(null)
  }
