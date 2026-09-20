import { InsertSongAudio, SaveSongAudio } from "./songs.ports"

export type SaveSongAudioDeps = Readonly<{
  putSongAudio: (songId: string, mp3: Uint8Array) => Promise<number>
  insertSongAudio: InsertSongAudio
  removeSongAudio: (songId: string) => Promise<void>
}>

export const makeSaveSongAudio =
  (deps: SaveSongAudioDeps): SaveSongAudio =>
  async (input) => {
    const byteLength = await deps.putSongAudio(input.songId, input.mp3)
    try {
      await deps.insertSongAudio({
        songId: input.songId,
        byteLength,
        contentType: input.contentType,
      })
    } catch (error: unknown) {
      await deps.removeSongAudio(input.songId).catch(() => undefined)
      throw error
    }
  }
