import { expect, test } from "bun:test"
import { makeReconcileMedia, missingAudioDetail } from "./songs.media.reconcile.usecase"

test("reconcile unlinks orphans and reports rows whose file is missing", async () => {
  const keptSongId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
  const orphanSongId = "01J8K3R4P9ABCDEFGHJKMNPQRT"
  const missingSongId = "01J8K3R4P9ABCDEFGHJKMNPQRV"
  const runningSongId = "01J8K3R4P9ABCDEFGHJKMNPQRW"
  const referenceId = "01J8K3R4P9ABCDEFGHJKMNPQRX"

  const removed: string[] = []
  const failed: string[] = []
  const reconcile = makeReconcileMedia({
    listMediaFiles: async () => [
      `songs/kept-song_${keptSongId}.mp3`,
      `songs/orphan-song_${orphanSongId}.mp3`,
      `songs/orphan-song_${orphanSongId}.mp3.tmp`,
    ],
    removeAudio: async (key) => {
      removed.push(key)
    },
    listSongAudio: async () => [
      { songId: keptSongId, songStatus: "complete" },
      { songId: missingSongId, songStatus: "complete" },
      { songId: runningSongId, songStatus: "running" },
    ],
    listReferenceAudio: async () => [{ id: referenceId, contentType: "audio/mpeg" }],
    markSongFailed: async (songId, detail) => {
      failed.push(`${songId}:${detail}`)
    },
  })

  const report = await reconcile()

  expect(report.removedOrphanFiles).toBe(2)
  expect(removed).toEqual([
    `songs/orphan-song_${orphanSongId}.mp3`,
    `songs/orphan-song_${orphanSongId}.mp3.tmp`,
  ])
  expect(report.failedSongIds).toEqual([missingSongId])
  expect(report.missingReferenceCount).toBe(1)
  expect(failed).toEqual([`${missingSongId}:${missingAudioDetail}`])
})

test("reconcile matches prefixed and bare file names to their rows", async () => {
  const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
  const bareReferenceId = "01J8K3R4P9ABCDEFGHJKMNPQRT"
  const titledReferenceId = "01J8K3R4P9ABCDEFGHJKMNPQRV"

  const removed: string[] = []
  const failed: string[] = []
  const reconcile = makeReconcileMedia({
    listMediaFiles: async () => [
      `songs/amazing-awesome-song_${songId}.mp3`,
      `references/${bareReferenceId}.wav`,
      `references/amazing-awesome-song_${titledReferenceId}.mp3`,
    ],
    removeAudio: async (key) => {
      removed.push(key)
    },
    listSongAudio: async () => [{ songId, songStatus: "complete" }],
    listReferenceAudio: async () => [
      { id: bareReferenceId, contentType: "audio/wav" },
      { id: titledReferenceId, contentType: "audio/mpeg" },
    ],
    markSongFailed: async (songId, detail) => {
      failed.push(`${songId}:${detail}`)
    },
  })

  const report = await reconcile()

  expect(report).toEqual({ removedOrphanFiles: 0, failedSongIds: [], missingReferenceCount: 0 })
  expect(removed).toEqual([])
  expect(failed).toEqual([])
})
