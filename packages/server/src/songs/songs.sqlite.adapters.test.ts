import { expect, test } from "bun:test"
import { openDatabase } from "../db/client"
import { decodeCursor } from "./songs.cursor"
import { NewSong } from "./songs.models"
import {
  makeClaimNextQueuedSong,
  makeDeleteSong,
  makeFindSongAudio,
  makeFindSongById,
  makeInsertSong,
  makeListSongs,
  makeMarkSongComplete,
  makeMarkSongProgress,
  makeMarkSongStage,
  makeRecoverInterruptedSongs,
  makeSaveSongAudio,
} from "./songs.sqlite.adapters"

const id = (suffix: string) => `01J8K3R4P9ABCDEFGHJKMNPQ${suffix}`

const newSong = (songId: string, createdAt: string): NewSong => ({
  id: songId,
  lyrics: "hello",
  style: "pop",
  seed: 1,
  cot: "full",
  createdAt,
  updatedAt: createdAt,
})

test("list never carries audio bytes", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertSong = makeInsertSong(handle.db)
    const saveSongAudio = makeSaveSongAudio(handle.db)
    const listSongs = makeListSongs(handle.db)

    await insertSong(newSong(id("RS"), "2026-09-17T04:00:00.000Z"))
    await saveSongAudio({
      songId: id("RS"),
      mp3: new Uint8Array([1, 2, 3, 4, 5]),
      contentType: "audio/mpeg",
    })

    const page = await listSongs({ limit: 20, cursor: null, statuses: [] })

    expect(page.items).toHaveLength(1)
    expect(page.count).toBe(1)
    const item = page.items[0]
    if (item === undefined) throw new Error("expected one song")
    expect("mp3" in item).toBe(false)
    expect(JSON.stringify(page)).not.toContain("mp3")
  } finally {
    handle.close()
  }
})

test("list paginates newest first with a keyset cursor", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertSong = makeInsertSong(handle.db)
    const listSongs = makeListSongs(handle.db)

    await insertSong(newSong(id("R1"), "2026-09-17T04:00:00.000Z"))
    await insertSong(newSong(id("R2"), "2026-09-17T04:01:00.000Z"))
    await insertSong(newSong(id("R3"), "2026-09-17T04:02:00.000Z"))

    const first = await listSongs({ limit: 2, cursor: null, statuses: [] })
    expect(first.items.map((song) => song.id)).toEqual([id("R3"), id("R2")])
    const nextCursor = first.nextCursor
    if (nextCursor === null) throw new Error("expected a next cursor")
    const decoded = decodeCursor(nextCursor)
    if (decoded === null) throw new Error("expected a decodable cursor")

    const second = await listSongs({ limit: 2, cursor: decoded, statuses: [] })
    expect(second.items.map((song) => song.id)).toEqual([id("R1")])
    expect(second.nextCursor).toBeNull()
    expect(second.count).toBe(1)
  } finally {
    handle.close()
  }
})

test("claim skips running and complete songs", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertSong = makeInsertSong(handle.db)
    const claimNextQueuedSong = makeClaimNextQueuedSong(handle.db)
    const markSongComplete = makeMarkSongComplete(handle.db)

    await insertSong(newSong(id("R1"), "2026-09-17T04:00:00.000Z"))
    await insertSong(newSong(id("R2"), "2026-09-17T04:01:00.000Z"))
    await insertSong(newSong(id("R3"), "2026-09-17T04:02:00.000Z"))
    await insertSong(newSong(id("R4"), "2026-09-17T04:03:00.000Z"))

    const first = await claimNextQueuedSong()
    expect(first?.id).toBe(id("R1"))
    const second = await claimNextQueuedSong()
    expect(second?.id).toBe(id("R2"))

    await markSongComplete({
      songId: id("R3"),
      scoreAbc: null,
      durationSeconds: 12,
      truncated: { abc: false, semantic: false },
    })

    const third = await claimNextQueuedSong()
    expect(third?.id).toBe(id("R4"))
    expect(await claimNextQueuedSong()).toBeNull()
  } finally {
    handle.close()
  }
})

test("boot recovery marks running songs as interrupted", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertSong = makeInsertSong(handle.db)
    const claimNextQueuedSong = makeClaimNextQueuedSong(handle.db)
    const recoverInterruptedSongs = makeRecoverInterruptedSongs(handle.db)
    const findSongById = makeFindSongById(handle.db)

    await insertSong(newSong(id("R1"), "2026-09-17T04:00:00.000Z"))
    const running = await claimNextQueuedSong()
    expect(running?.status).toBe("running")

    const recovered = await recoverInterruptedSongs()
    expect(recovered).toBe(1)

    const song = await findSongById(id("R1"))
    expect(song?.status).toBe("failed")
    expect(song?.errorDetail).toBe("interrupted")
    expect(song?.completedAt).not.toBeNull()
    expect(song?.stage).toBeNull()
  } finally {
    handle.close()
  }
})

test("stage progress is stored and reset when the stage changes", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertSong = makeInsertSong(handle.db)
    const claimNextQueuedSong = makeClaimNextQueuedSong(handle.db)
    const markSongProgress = makeMarkSongProgress(handle.db)
    const markSongStage = makeMarkSongStage(handle.db)
    const findSongById = makeFindSongById(handle.db)

    await insertSong(newSong(id("R1"), "2026-09-17T04:00:00.000Z"))
    await claimNextQueuedSong()

    await markSongStage(id("R1"), "synthesize")
    await markSongProgress(id("R1"), { stage: "synthesize", completed: 12, total: 40 })

    const running = await findSongById(id("R1"))
    expect(running?.stage).toBe("synthesize")
    expect(running?.stageCompleted).toBe(12)
    expect(running?.stageTotal).toBe(40)

    await markSongStage(id("R1"), "decode")
    const nextStage = await findSongById(id("R1"))
    expect(nextStage?.stage).toBe("decode")
    expect(nextStage?.stageCompleted).toBeNull()
    expect(nextStage?.stageTotal).toBeNull()
  } finally {
    handle.close()
  }
})

test("deleting a song cascades to its audio", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertSong = makeInsertSong(handle.db)
    const saveSongAudio = makeSaveSongAudio(handle.db)
    const findSongAudio = makeFindSongAudio(handle.db)
    const deleteSong = makeDeleteSong(handle.db)

    await insertSong(newSong(id("R1"), "2026-09-17T04:00:00.000Z"))
    await saveSongAudio({
      songId: id("R1"),
      mp3: new Uint8Array([9, 9, 9]),
      contentType: "audio/mpeg",
    })

    expect(await deleteSong(id("R1"))).toBe(true)
    expect(await deleteSong(id("R1"))).toBe(false)
    expect(await findSongAudio(id("R1"))).toBeNull()
  } finally {
    handle.close()
  }
})
