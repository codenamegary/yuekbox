import { expect, test } from "bun:test"
import { openDatabase } from "../db/client"
import { NewReference, NewSong } from "./songs.models"
import {
  makeAttachReferenceToSong,
  makeDeleteSong,
  makeDeleteStaleReferences,
  makeFindReferenceById,
  makeFindReferenceBySongId,
  makeFindSongById,
  makeInsertReference,
  makeInsertSong,
  makeListSongs,
  makeSaveReferenceScore,
} from "./songs.sqlite.adapters"

const id = (suffix: string) => `01J8K3R4P9ABCDEFGHJKMNPQ${suffix}`

const newSong = (
  songId: string,
  createdAt: string,
  referenceId: string | null = null,
): NewSong => ({
  id: songId,
  lyrics: "hello",
  style: "pop",
  seed: 1,
  cot: referenceId === null ? "full" : "melody",
  referenceId,
  createdAt,
  updatedAt: createdAt,
})

const newReference = (referenceId: string, createdAt: string): NewReference => ({
  id: referenceId,
  filename: "demo-song.mp3",
  contentType: "audio/mpeg",
  byteLength: 5,
  createdAt,
})

test("insert and find a reference round-trips its metadata and resolves the audio path", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertReference = makeInsertReference(handle.db)
    const findReferenceById = makeFindReferenceById(handle.db)

    const inserted = await insertReference(newReference(id("RF"), "2026-09-17T04:00:00.000Z"))

    expect(inserted.songId).toBeNull()
    expect(inserted.scoreAbc).toBeNull()
    expect(inserted.byteLength).toBe(5)
    expect(inserted.audioPath).toBe(`references/${id("RF")}.mp3`)

    const found = await findReferenceById(id("RF"))
    expect(found?.filename).toBe("demo-song.mp3")
    expect(found?.contentType).toBe("audio/mpeg")
    expect(found?.byteLength).toBe(5)
    expect(found?.audioPath).toBe(`references/${id("RF")}.mp3`)
  } finally {
    handle.close()
  }
})

test("attach binds a reference to one song only", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertReference = makeInsertReference(handle.db)
    const insertSong = makeInsertSong(handle.db)
    const attachReferenceToSong = makeAttachReferenceToSong(handle.db)
    const findReferenceBySongId = makeFindReferenceBySongId(handle.db)

    await insertReference(newReference(id("RF"), "2026-09-17T04:00:00.000Z"))
    await insertSong(newSong(id("S1"), "2026-09-17T04:00:00.000Z", id("RF")))
    await insertSong(newSong(id("S2"), "2026-09-17T04:01:00.000Z"))

    expect(await attachReferenceToSong(id("RF"), id("S1"))).toBe(true)
    expect(await attachReferenceToSong(id("RF"), id("S2"))).toBe(false)
    expect(await attachReferenceToSong(id("RF"), id("S3"))).toBe(false)

    const found = await findReferenceBySongId(id("S1"))
    expect(found?.id).toBe(id("RF"))
    expect(await findReferenceBySongId(id("S2"))).toBeNull()
  } finally {
    handle.close()
  }
})

test("saving the transcribed score keeps the melody ABC", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertReference = makeInsertReference(handle.db)
    const saveReferenceScore = makeSaveReferenceScore(handle.db)
    const findReferenceById = makeFindReferenceById(handle.db)

    await insertReference(newReference(id("RF"), "2026-09-17T04:00:00.000Z"))
    await saveReferenceScore(id("RF"), "X:1\nK:C\nC D E|")

    expect((await findReferenceById(id("RF")))?.scoreAbc).toBe("X:1\nK:C\nC D E|")
  } finally {
    handle.close()
  }
})

test("deleting a song cascades to its reference", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertReference = makeInsertReference(handle.db)
    const insertSong = makeInsertSong(handle.db)
    const attachReferenceToSong = makeAttachReferenceToSong(handle.db)
    const findReferenceById = makeFindReferenceById(handle.db)
    const deleteSong = makeDeleteSong(handle.db)

    await insertReference(newReference(id("RF"), "2026-09-17T04:00:00.000Z"))
    await insertSong(newSong(id("S1"), "2026-09-17T04:00:00.000Z", id("RF")))
    await attachReferenceToSong(id("RF"), id("S1"))

    expect(await deleteSong(id("S1"))).toBe(true)
    expect(await findReferenceById(id("RF"))).toBeNull()
  } finally {
    handle.close()
  }
})

test("stale purge removes only unattached references older than the cutoff", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertReference = makeInsertReference(handle.db)
    const insertSong = makeInsertSong(handle.db)
    const attachReferenceToSong = makeAttachReferenceToSong(handle.db)
    const deleteStaleReferences = makeDeleteStaleReferences(handle.db)
    const findReferenceById = makeFindReferenceById(handle.db)

    await insertReference(newReference(id("OLD"), "2026-09-17T03:00:00.000Z"))
    await insertReference(newReference(id("NEW"), "2026-09-17T04:30:00.000Z"))
    await insertReference(newReference(id("USED"), "2026-09-17T03:00:00.000Z"))
    await insertSong(newSong(id("S1"), "2026-09-17T04:00:00.000Z", id("USED")))
    await attachReferenceToSong(id("USED"), id("S1"))

    const removed = await deleteStaleReferences("2026-09-17T04:00:00.000Z")

    expect(removed.map((reference) => reference.id)).toEqual([id("OLD")])
    expect(removed[0]?.contentType).toBe("audio/mpeg")
    expect(await findReferenceById(id("OLD"))).toBeNull()
    expect(await findReferenceById(id("NEW"))).not.toBeNull()
    expect(await findReferenceById(id("USED"))).not.toBeNull()
  } finally {
    handle.close()
  }
})

test("the migrated references table keeps metadata without an audio blob", () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const columns = handle.sqlite
      .query<{ name: string }, []>("PRAGMA table_info(`references`)")
      .all()

    expect(columns.map((column) => column.name)).toEqual([
      "id",
      "song_id",
      "filename",
      "content_type",
      "byte_length",
      "score_abc",
      "created_at",
    ])
  } finally {
    handle.close()
  }
})

test("song queries carry the reference summary without audio bytes", async () => {
  const handle = openDatabase({ path: ":memory:" })
  try {
    const insertReference = makeInsertReference(handle.db)
    const insertSong = makeInsertSong(handle.db)
    const attachReferenceToSong = makeAttachReferenceToSong(handle.db)
    const findSongById = makeFindSongById(handle.db)
    const listSongs = makeListSongs(handle.db)

    await insertReference(newReference(id("RF"), "2026-09-17T04:00:00.000Z"))
    await insertSong(newSong(id("S1"), "2026-09-17T04:00:00.000Z", id("RF")))
    await attachReferenceToSong(id("RF"), id("S1"))

    const found = await findSongById(id("S1"))
    expect(found?.reference).toEqual({ id: id("RF"), filename: "demo-song.mp3" })

    const page = await listSongs({ limit: 20, cursor: null, statuses: [] })
    const item = page.items[0]
    expect(item?.reference).toEqual({ id: id("RF"), filename: "demo-song.mp3" })
    expect(JSON.stringify(page)).not.toContain("audio")
  } finally {
    handle.close()
  }
})
