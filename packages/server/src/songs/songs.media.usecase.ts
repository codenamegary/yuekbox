import { referenceAudioKey, songAudioKey } from "../media/audio.keys"
import {
  AudioStore,
  DeleteStaleReferences,
  FindReferenceAudioBySongId,
  FindReferenceBySongId,
  InsertSongAudio,
  ListReferenceAudio,
  ListSongAudio,
  MarkSongFailed,
  SaveSongAudio,
} from "./songs.ports"

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

export type PurgeStaleReferencesDeps = Readonly<{
  deleteStaleReferences: DeleteStaleReferences
  removeReferenceAudio: (referenceId: string, contentType: string) => Promise<void>
}>

export const makePurgeStaleReferences =
  (deps: PurgeStaleReferencesDeps) =>
  async (createdBefore: string): Promise<number> => {
    const deleted = await deps.deleteStaleReferences(createdBefore)
    await Promise.all(
      deleted.map((reference) => deps.removeReferenceAudio(reference.id, reference.contentType)),
    )
    return deleted.length
  }

export const missingAudioDetail = "audio file missing on disk"

export type FindReferenceAudioBySongIdDeps = Readonly<{
  findReferenceBySongId: FindReferenceBySongId
  resolveReferenceAudioPath: (referenceId: string, contentType: string) => string
}>

export const makeFindReferenceAudioBySongId =
  (deps: FindReferenceAudioBySongIdDeps): FindReferenceAudioBySongId =>
  async (songId) => {
    const reference = await deps.findReferenceBySongId(songId)
    if (reference === null) return null
    return {
      reference,
      audioPath: deps.resolveReferenceAudioPath(reference.id, reference.contentType),
    }
  }

export type ReconcileMediaDeps = Readonly<{
  audioStore: AudioStore
  listSongAudio: ListSongAudio
  listReferenceAudio: ListReferenceAudio
  markSongFailed: MarkSongFailed
}>

export type ReconcileReport = Readonly<{
  removedOrphanFiles: number
  failedSongIds: readonly string[]
  missingReferenceCount: number
}>

export const makeReconcileMedia =
  (deps: ReconcileMediaDeps) => async (): Promise<ReconcileReport> => {
    const files = await deps.audioStore.list()
    const songAudio = await deps.listSongAudio()
    const referenceAudio = await deps.listReferenceAudio()

    const songKeys = new Set(songAudio.map((record) => songAudioKey(record.songId)))
    const referenceKeys = new Set(
      referenceAudio.map((record) => referenceAudioKey(record.id, record.contentType)),
    )
    const orphans = files.filter((file) => !songKeys.has(file) && !referenceKeys.has(file))
    await Promise.all(orphans.map((file) => deps.audioStore.remove(file)))

    const present = new Set(files)
    const failedSongIds = songAudio
      .filter(
        (record) => record.songStatus === "complete" && !present.has(songAudioKey(record.songId)),
      )
      .map((record) => record.songId)
    await Promise.all(
      failedSongIds.map((songId) => deps.markSongFailed(songId, missingAudioDetail)),
    )

    const missingReferenceCount = referenceAudio.filter(
      (record) => !present.has(referenceAudioKey(record.id, record.contentType)),
    ).length

    return Object.freeze({
      removedOrphanFiles: orphans.length,
      failedSongIds,
      missingReferenceCount,
    })
  }
