import { PutFile } from "../media/media.ports"
import { referenceScoreKey } from "./songs.files"
import { Song } from "./songs.models"
import { FindSongById, SaveReferenceScore } from "./songs.ports"

export type SaveReferenceScoreDeps = Readonly<{
  findSongById: FindSongById
  resolveSongFolder: (song: Song) => Promise<string>
  putFile: PutFile
}>

export const makeSaveReferenceScore =
  (deps: SaveReferenceScoreDeps): SaveReferenceScore =>
  async (songId, scoreAbc) => {
    const song = await deps.findSongById(songId)
    if (song === null) {
      throw new Error(`song ${songId} is missing`)
    }
    const folderKey = await deps.resolveSongFolder(song)
    await deps.putFile(referenceScoreKey(folderKey), new TextEncoder().encode(scoreAbc))
  }
