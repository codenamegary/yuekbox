import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { referenceAudioKey, songAudioKey } from "../media/audio.keys"
import { makeFsAudioStore } from "../media/audio.store"
import {
  makePurgeStaleReferences,
  makeReconcileMedia,
  makeSaveSongAudio,
  missingAudioDetail,
  SaveSongAudioDeps,
} from "./songs.media.usecase"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

const makeDeps = (calls: string[], failInsert = false): SaveSongAudioDeps => ({
  putSongAudio: async (_songId, mp3) => {
    calls.push("put")
    return mp3.byteLength
  },
  insertSongAudio: async (row) => {
    calls.push(`insert:${row.byteLength}:${row.contentType}`)
    if (failInsert) throw new Error("row commit failed")
  },
  removeSongAudio: async () => {
    calls.push("remove")
  },
})

test("save writes the file first, then commits the row", async () => {
  const calls: string[] = []
  const save = makeSaveSongAudio(makeDeps(calls))

  await save({ songId, mp3: new Uint8Array([1, 2, 3, 4]), contentType: "audio/mpeg" })

  expect(calls).toEqual(["put", "insert:4:audio/mpeg"])
})

test("save unlinks the file when the row commit fails", async () => {
  const calls: string[] = []
  const save = makeSaveSongAudio(makeDeps(calls, true))

  const failure = await save({
    songId,
    mp3: new Uint8Array([1, 2]),
    contentType: "audio/mpeg",
  }).then(
    () => "resolved",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )

  expect(failure).toBe("row commit failed")
  expect(calls).toEqual(["put", "insert:2:audio/mpeg", "remove"])
})

test("purge unlinks every deleted reference file", async () => {
  const calls: string[] = []
  const purge = makePurgeStaleReferences({
    deleteStaleReferences: async (createdBefore) => {
      calls.push(`delete:${createdBefore}`)
      return [
        { id: "01J8K3R4P9ABCDEFGHJKMNPQRA", contentType: "audio/mpeg" },
        { id: "01J8K3R4P9ABCDEFGHJKMNPQRB", contentType: "audio/wav" },
      ]
    },
    removeReferenceAudio: async (referenceId, contentType) => {
      calls.push(`remove:${referenceId}:${contentType}`)
    },
  })

  const removed = await purge("2026-09-17T04:00:00.000Z")

  expect(removed).toBe(2)
  expect(calls).toEqual([
    "delete:2026-09-17T04:00:00.000Z",
    "remove:01J8K3R4P9ABCDEFGHJKMNPQRA:audio/mpeg",
    "remove:01J8K3R4P9ABCDEFGHJKMNPQRB:audio/wav",
  ])
})

test("purge with nothing stale unlinks nothing", async () => {
  const calls: string[] = []
  const purge = makePurgeStaleReferences({
    deleteStaleReferences: async () => [],
    removeReferenceAudio: async (referenceId) => {
      calls.push(`remove:${referenceId}`)
    },
  })

  expect(await purge("2026-09-17T04:00:00.000Z")).toBe(0)
  expect(calls).toEqual([])
})

const withStore = async (
  run: (store: ReturnType<typeof makeFsAudioStore>, mediaDir: string) => Promise<void>,
): Promise<void> => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-reconcile-test-"))
  try {
    await run(makeFsAudioStore(mediaDir), mediaDir)
  } finally {
    await rm(mediaDir, { recursive: true, force: true })
  }
}

test("reconcile unlinks orphans and reports rows whose file is missing", async () => {
  await withStore(async (store) => {
    const keptSongId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
    const orphanSongId = "01J8K3R4P9ABCDEFGHJKMNPQRT"
    const missingSongId = "01J8K3R4P9ABCDEFGHJKMNPQRV"
    const runningSongId = "01J8K3R4P9ABCDEFGHJKMNPQRW"
    const referenceId = "01J8K3R4P9ABCDEFGHJKMNPQRX"

    await store.put(songAudioKey(keptSongId), new Uint8Array([1, 2, 3]))
    await store.put(songAudioKey(orphanSongId), new Uint8Array([4, 5]))
    await store.put(`${songAudioKey(orphanSongId)}.tmp`, new Uint8Array([9]))

    const failed: string[] = []
    const reconcile = makeReconcileMedia({
      audioStore: store,
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
    expect(report.failedSongIds).toEqual([missingSongId])
    expect(report.missingReferenceCount).toBe(1)
    expect(failed).toEqual([`${missingSongId}:${missingAudioDetail}`])
    expect(await store.stat(songAudioKey(keptSongId))).not.toBeNull()
    expect(await store.stat(songAudioKey(orphanSongId))).toBeNull()
    expect(await store.stat(`${songAudioKey(orphanSongId)}.tmp`)).toBeNull()
  })
})

test("reconcile leaves matching files and rows untouched", async () => {
  await withStore(async (store) => {
    const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
    const referenceId = "01J8K3R4P9ABCDEFGHJKMNPQRT"

    await store.put(songAudioKey(songId), new Uint8Array([1]))
    await store.put(referenceAudioKey(referenceId, "audio/wav"), new Uint8Array([2]))

    const failed: string[] = []
    const reconcile = makeReconcileMedia({
      audioStore: store,
      listSongAudio: async () => [{ songId, songStatus: "complete" }],
      listReferenceAudio: async () => [{ id: referenceId, contentType: "audio/wav" }],
      markSongFailed: async (songId, detail) => {
        failed.push(`${songId}:${detail}`)
      },
    })

    const report = await reconcile()

    expect(report).toEqual({ removedOrphanFiles: 0, failedSongIds: [], missingReferenceCount: 0 })
    expect(failed).toEqual([])
    expect(await store.stat(songAudioKey(songId))).not.toBeNull()
    expect(await store.stat(referenceAudioKey(referenceId, "audio/wav"))).not.toBeNull()
  })
})
