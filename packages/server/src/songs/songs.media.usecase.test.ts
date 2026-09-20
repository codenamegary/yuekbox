import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { referenceAudioKey, songAudioKey } from "../media/audio.keys"
import { makeFsAudioStore } from "../media/audio.store"
import { Reference } from "./songs.models"
import {
  makeFindReferenceAudioBySongId,
  makePurgeStaleReferences,
  makeReconcileMedia,
  makeRemoveMediaById,
  makeSaveSongAudio,
  missingAudioDetail,
  SaveSongAudioDeps,
} from "./songs.media.usecase"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

const makeDeps = (calls: string[], failInsert = false): SaveSongAudioDeps => ({
  putSongAudio: async (_songId, mp3, title) => {
    calls.push(`put:${title}`)
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

  await save({
    songId,
    mp3: new Uint8Array([1, 2, 3, 4]),
    contentType: "audio/mpeg",
    title: "amazing-awesome-song",
  })

  expect(calls).toEqual(["put:amazing-awesome-song", "insert:4:audio/mpeg"])
})

test("save unlinks the file when the row commit fails", async () => {
  const calls: string[] = []
  const save = makeSaveSongAudio(makeDeps(calls, true))

  const failure = await save({
    songId,
    mp3: new Uint8Array([1, 2]),
    contentType: "audio/mpeg",
    title: "amazing-awesome-song",
  }).then(
    () => "resolved",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )

  expect(failure).toBe("row commit failed")
  expect(calls).toEqual(["put:amazing-awesome-song", "insert:2:audio/mpeg", "remove"])
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

test("removeMediaById unlinks only files for that role and id", async () => {
  const id = "01J8K3R4P9ABCDEFGHJKMNPQRS"
  const otherId = "01J8K3R4P9ABCDEFGHJKMNPQRT"
  const removed: string[] = []
  const removeMediaById = makeRemoveMediaById({
    listMediaFiles: async () => [
      `songs/amazing-awesome-song_${id}.mp3`,
      `songs/${id}.mp3`,
      `references/${id}.mp3`,
      `songs/other-song_${otherId}.mp3`,
      "songs/junk.txt",
    ],
    removeMediaFile: async (key) => {
      removed.push(key)
    },
  })

  await removeMediaById("song", id)

  expect(removed).toEqual([`songs/amazing-awesome-song_${id}.mp3`, `songs/${id}.mp3`])
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

    await store.put(songAudioKey(keptSongId, "kept-song"), new Uint8Array([1, 2, 3]))
    await store.put(songAudioKey(orphanSongId, "orphan-song"), new Uint8Array([4, 5]))
    await store.put(`${songAudioKey(orphanSongId, "orphan-song")}.tmp`, new Uint8Array([9]))

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
    expect(await store.stat(songAudioKey(keptSongId, "kept-song"))).not.toBeNull()
    expect(await store.stat(songAudioKey(orphanSongId, "orphan-song"))).toBeNull()
    expect(await store.stat(`${songAudioKey(orphanSongId, "orphan-song")}.tmp`)).toBeNull()
  })
})

test("reconcile matches prefixed and bare file names to their rows", async () => {
  await withStore(async (store) => {
    const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
    const bareReferenceId = "01J8K3R4P9ABCDEFGHJKMNPQRT"
    const titledReferenceId = "01J8K3R4P9ABCDEFGHJKMNPQRV"

    await store.put(songAudioKey(songId, "amazing-awesome-song"), new Uint8Array([1]))
    await store.put(referenceAudioKey(bareReferenceId, "audio/wav", null), new Uint8Array([2]))
    await store.put(
      referenceAudioKey(titledReferenceId, "audio/mpeg", "amazing-awesome-song"),
      new Uint8Array([3]),
    )

    const failed: string[] = []
    const reconcile = makeReconcileMedia({
      audioStore: store,
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
    expect(failed).toEqual([])
    expect(await store.stat(songAudioKey(songId, "amazing-awesome-song"))).not.toBeNull()
    expect(await store.stat(referenceAudioKey(bareReferenceId, "audio/wav", null))).not.toBeNull()
    expect(
      await store.stat(referenceAudioKey(titledReferenceId, "audio/mpeg", "amazing-awesome-song")),
    ).not.toBeNull()
  })
})

test("findReferenceAudioBySongId resolves an absolute path under the media root", async () => {
  await withStore(async (store, mediaDir) => {
    const reference: Reference = Object.freeze({
      id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
      songId: "01J8K3R4P9ABCDEFGHJKMNPQRT",
      filename: "demo-song.mp3",
      contentType: "audio/mpeg",
      byteLength: 5,
      scoreAbc: null,
      createdAt: "2026-09-17T04:00:00.000Z",
    })
    const findReferenceAudioBySongId = makeFindReferenceAudioBySongId({
      findReferenceBySongId: async () => reference,
      resolveReferenceAudioPath: (referenceId, contentType) =>
        store.path(referenceAudioKey(referenceId, contentType, null)),
    })

    const found = await findReferenceAudioBySongId("01J8K3R4P9ABCDEFGHJKMNPQRT")

    expect(found?.reference).toEqual(reference)
    expect(found?.audioPath).toBe(join(mediaDir, "references", `${reference.id}.mp3`))
  })
})

test("findReferenceAudioBySongId is null when no reference is attached", async () => {
  await withStore(async (store) => {
    const findReferenceAudioBySongId = makeFindReferenceAudioBySongId({
      findReferenceBySongId: async () => null,
      resolveReferenceAudioPath: (referenceId, contentType) =>
        store.path(referenceAudioKey(referenceId, contentType, null)),
    })

    expect(await findReferenceAudioBySongId("01J8K3R4P9ABCDEFGHJKMNPQRS")).toBeNull()
  })
})
