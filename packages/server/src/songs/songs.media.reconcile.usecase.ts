import { parseMediaKey } from "./songs.media.keys"
import {
  ListMediaFiles,
  ListReferenceAudio,
  ListSongAudio,
  MarkSongFailed,
  RemoveAudio,
} from "./songs.ports"

export const missingAudioDetail = "audio file missing on disk"

export type ReconcileMediaDeps = Readonly<{
  listMediaFiles: ListMediaFiles
  removeAudio: RemoveAudio
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
    const files = await deps.listMediaFiles()
    const songAudio = await deps.listSongAudio()
    const referenceAudio = await deps.listReferenceAudio()

    const parsed = files.map((file) => ({ file, match: parseMediaKey(file) }))
    const songIds = new Set(songAudio.map((record) => record.songId))
    const referenceIds = new Set(referenceAudio.map((record) => record.id))
    const hasRow = (match: NonNullable<ReturnType<typeof parseMediaKey>>): boolean =>
      match.role === "song" ? songIds.has(match.id) : referenceIds.has(match.id)

    const orphans = parsed.filter(({ match }) => match === null || !hasRow(match))
    await Promise.all(orphans.map(({ file }) => deps.removeAudio(file)))

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
