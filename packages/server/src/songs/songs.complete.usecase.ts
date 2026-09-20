import { PutFile, RemoveFile } from "../media/media.ports"
import { CompleteSongInput, Song } from "./songs.models"
import { generatedAudioKey, scoreKey } from "./songs.files"
import { CompleteSong, FindSongById, MarkSongComplete } from "./songs.ports"

export type CompleteSongDeps = Readonly<{
  findSongById: FindSongById
  resolveSongFolder: (song: Song) => Promise<string>
  putFile: PutFile
  removeFile: RemoveFile
  markSongComplete: MarkSongComplete
}>

const encodeScore = (scoreAbc: string): Uint8Array => new TextEncoder().encode(scoreAbc)

export const makeCompleteSong =
  (deps: CompleteSongDeps): CompleteSong =>
  async (input: CompleteSongInput): Promise<void> => {
    const song = await deps.findSongById(input.songId)
    if (song === null) {
      throw new Error(`song ${input.songId} is missing`)
    }

    const folderKey = await deps.resolveSongFolder(song)
    await deps.putFile(generatedAudioKey(folderKey, input.songId), input.mp3)
    if (input.scoreAbc !== null) {
      await deps.putFile(scoreKey(folderKey), encodeScore(input.scoreAbc))
    }

    try {
      await deps.markSongComplete({
        songId: input.songId,
        durationSeconds: input.durationSeconds,
        truncated: input.truncated,
      })
    } catch (error: unknown) {
      await Promise.all([
        deps.removeFile(generatedAudioKey(folderKey, input.songId)).catch(() => undefined),
        deps.removeFile(scoreKey(folderKey)).catch(() => undefined),
      ])
      throw error
    }
  }
