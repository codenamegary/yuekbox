import { MediaFileRef, parseMediaKey } from "../media/audio.keys"
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
  putSongAudio: (songId: string, mp3: Uint8Array, title: string) => Promise<number>
  insertSongAudio: InsertSongAudio
  removeSongAudio: (songId: string) => Promise<void>
}>

export const makeSaveSongAudio =
  (deps: SaveSongAudioDeps): SaveSongAudio =>
  async (input) => {
    const byteLength = await deps.putSongAudio(input.songId, input.mp3, input.title)
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

export type RemoveMediaByIdDeps = Readonly<{
  listMediaFiles: () => Promise<readonly string[]>
  removeMediaFile: (key: string) => Promise<void>
}>

export const makeRemoveMediaById =
  (deps: RemoveMediaByIdDeps) =>
  async (role: MediaFileRef["role"], id: string): Promise<void> => {
    const files = await deps.listMediaFiles()
    const matching = files.filter((file) => {
      const match = parseMediaKey(file)
      return match !== null && match.role === role && match.id === id
    })
    await Promise.all(matching.map((file) => deps.removeMediaFile(file)))
  }

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

    const parsed = files.map((file) => ({ file, match: parseMediaKey(file) }))
    const songIds = new Set(songAudio.map((record) => record.songId))
    const referenceIds = new Set(referenceAudio.map((record) => record.id))
    const hasRow = (match: NonNullable<ReturnType<typeof parseMediaKey>>): boolean =>
      match.role === "song" ? songIds.has(match.id) : referenceIds.has(match.id)

    const orphans = parsed.filter(({ match }) => match === null || !hasRow(match))
    await Promise.all(orphans.map(({ file }) => deps.audioStore.remove(file)))

    const presentSongIds = new Set(
      parsed.flatMap(({ match }) => (match?.role === "song" ? [match.id] : [])),
    )
    const presentReferenceIds = new Set(
      parsed.flatMap(({ match }) => (match?.role === "reference" ? [match.id] : [])),
    )

    const failedSongIds = songAudio
      .filter((record) => record.songStatus === "complete" && !presentSongIds.has(record.songId))
      .map((record) => record.songId)
    await Promise.all(
      failedSongIds.map((songId) => deps.markSongFailed(songId, missingAudioDetail)),
    )

    const missingReferenceCount = referenceAudio.filter(
      (record) => !presentReferenceIds.has(record.id),
    ).length

    return Object.freeze({
      removedOrphanFiles: orphans.length,
      failedSongIds,
      missingReferenceCount,
    })
  }
