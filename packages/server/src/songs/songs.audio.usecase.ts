import { StoredFile } from "../media/media.ports"
import { err, ok, Result } from "../shared/result"
import { ByteRange, Song, SongAudioLookupError, SongAudioPayload } from "./songs.models"
import { FindSongById } from "./songs.ports"

export type GetSongAudioDeps = Readonly<{
  findSongById: FindSongById
  statSongAudio: (song: Song) => Promise<StoredFile | null>
  readSongAudio: (song: Song, range: ByteRange | null) => Promise<Uint8Array>
}>

export const makeGetSongAudio =
  (deps: GetSongAudioDeps) =>
  async (songId: string): Promise<Result<SongAudioPayload, SongAudioLookupError>> => {
    const song = await deps.findSongById(songId)
    if (song === null) return err({ kind: "not_found" })
    if (song.status !== "complete") return err({ kind: "not_complete" })

    const stored = await deps.statSongAudio(song)
    if (stored === null) return err({ kind: "not_found" })

    return ok(
      Object.freeze({
        contentType: "audio/mpeg",
        byteLength: stored.byteLength,
        read: (range: ByteRange | null) => deps.readSongAudio(song, range),
      }),
    )
  }
