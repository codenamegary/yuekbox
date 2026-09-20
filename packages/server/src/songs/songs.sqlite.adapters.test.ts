import { expect, test } from "bun:test"
import { openDatabase } from "../db/client"
import { decodeCursor } from "./songs.cursor"
import { NewSong } from "./songs.models"
import {
  makeClaimNextQueuedSong,
  makeDeleteSong,
  makeFindSongById,
  makeInsertSong,
  makeListSongs,
  makeMarkSongComplete,
  makeMarkSongProgress,
  makeMarkSongStage,
  makeRecoverInterruptedSongs,
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

test("the fresh schema keeps songs and ai_config only, without media columns", () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const tables = handle.sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
      )
      .all()
    expect(tables.map((table) => table.name).toSorted()).toEqual(["ai_config", "songs"])

    const columns = handle.sqlite.query<{ name: string }, []>("PRAGMA table_info(songs)").all()
    expect(columns.map((column) => column.name)).not.toContain("score_abc")
  } finally {
    handle.close()
  }
})

test("insert and find round-trip the lifecycle fields", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertSong = makeInsertSong(handle.db)
    const findSongById = makeFindSongById(handle.db)

    const inserted = await insertSong(newSong(id("R1"), "2026-09-17T04:00:00.000Z"))
    expect(inserted.status).toBe("queued")
    expect(inserted.reference).toBeNull()
    expect(inserted.scoreAbc).toBeNull()

    const found = await findSongById(id("R1"))
    expect(found?.lyrics).toBe("hello")
    expect(found?.style).toBe("pop")
  } finally {
    handle.close()
  }
})

test("list paginates newest first with a keyset cursor and no media bytes", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertSong = makeInsertSong(handle.db)
    const listSongs = makeListSongs(handle.db)

    await insertSong(newSong(id("R1"), "2026-09-17T04:00:00.000Z"))
    await insertSong(newSong(id("R2"), "2026-09-17T04:01:00.000Z"))
    await insertSong(newSong(id("R3"), "2026-09-17T04:02:00.000Z"))

    const first = await listSongs({ limit: 2, cursor: null, statuses: [] })
    expect(first.items.map((song) => song.id)).toEqual([id("R3"), id("R2")])
    expect(JSON.stringify(first)).not.toContain("mp3")
    expect(first.items[0]?.reference).toBeNull()
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

test("delete reports whether the row existed and is idempotent", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertSong = makeInsertSong(handle.db)
    const deleteSong = makeDeleteSong(handle.db)

    await insertSong(newSong(id("R1"), "2026-09-17T04:00:00.000Z"))

    expect(await deleteSong(id("R1"))).toBe(true)
    expect(await deleteSong(id("R1"))).toBe(false)
  } finally {
    handle.close()
  }
})
