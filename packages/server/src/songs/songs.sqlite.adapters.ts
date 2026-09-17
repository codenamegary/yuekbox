import { and, asc, count, desc, eq, inArray, lt, or, SQL } from "drizzle-orm"
import { SongStageSchema, SongStatusSchema } from "contracts/http/songs"
import { Db } from "../db/client"
import { songAudioTable, songsTable } from "../db/db.schema"
import { encodeCursor } from "./songs.cursor"
import { interruptedErrorDetail, NewSong, Song } from "./songs.models"
import {
  ClaimNextQueuedSong,
  DeleteSong,
  FindSongAudio,
  FindSongById,
  InsertSong,
  ListSongs,
  MarkSongComplete,
  MarkSongFailed,
  MarkSongProgress,
  MarkSongRunning,
  MarkSongStage,
  RecoverInterruptedSongs,
  SaveSongAudio,
} from "./songs.ports"

const toSong = (row: typeof songsTable.$inferSelect): Song =>
  Object.freeze({
    id: row.id,
    status: SongStatusSchema.parse(row.status),
    stage: row.stage === null ? null : SongStageSchema.parse(row.stage),
    stageCompleted: row.stageCompleted,
    stageTotal: row.stageTotal,
    lyrics: row.lyrics,
    style: row.style,
    seed: row.seed,
    cot: row.cot,
    scoreAbc: row.scoreAbc,
    durationSeconds: row.durationSeconds,
    truncatedAbc: row.truncatedAbc,
    truncatedSemantic: row.truncatedSemantic,
    errorDetail: row.errorDetail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  })

export const makeInsertSong =
  (db: Db): InsertSong =>
  async (song: NewSong) => {
    const values: typeof songsTable.$inferInsert = {
      id: song.id,
      status: "queued",
      stage: null,
      lyrics: song.lyrics,
      style: song.style,
      seed: song.seed,
      cot: song.cot,
      createdAt: song.createdAt,
      updatedAt: song.updatedAt,
    }
    const rows = await db.insert(songsTable).values(values).returning()
    const row = rows[0]
    if (row === undefined) {
      throw new Error("insertSong returned no row")
    }
    return toSong(row)
  }

export const makeFindSongById =
  (db: Db): FindSongById =>
  async (songId) => {
    const rows = await db.select().from(songsTable).where(eq(songsTable.id, songId)).limit(1)
    const row = rows[0]
    return row === undefined ? null : toSong(row)
  }

export const makeListSongs =
  (db: Db): ListSongs =>
  async (query) => {
    const conditions: SQL[] = []
    if (query.statuses.length > 0) {
      conditions.push(inArray(songsTable.status, [...query.statuses]))
    }
    if (query.cursor !== null) {
      const cursorCondition = or(
        lt(songsTable.createdAt, query.cursor.createdAt),
        and(eq(songsTable.createdAt, query.cursor.createdAt), lt(songsTable.id, query.cursor.id)),
      )
      if (cursorCondition !== undefined) {
        conditions.push(cursorCondition)
      }
    }
    const where = conditions.length === 0 ? undefined : and(...conditions)

    const rows = await db
      .select()
      .from(songsTable)
      .where(where)
      .orderBy(desc(songsTable.createdAt), desc(songsTable.id))
      .limit(query.limit + 1)

    const hasNextPage = rows.length > query.limit
    const visibleRows = hasNextPage ? rows.slice(0, query.limit) : rows
    const items = visibleRows.map(toSong)

    const countRows = await db.select({ value: count() }).from(songsTable).where(where)
    const total = countRows[0]?.value ?? 0

    const lastItem = items.at(-1)
    const nextCursor =
      hasNextPage && lastItem !== undefined
        ? encodeCursor({ createdAt: lastItem.createdAt, id: lastItem.id })
        : null

    return {
      items,
      limit: query.limit,
      nextCursor,
      previousCursor: query.cursor === null ? null : encodeCursor(query.cursor),
      count: total,
    }
  }

export const makeSaveSongAudio =
  (db: Db): SaveSongAudio =>
  async (input) => {
    const mp3 = Buffer.from(input.mp3)
    await db
      .insert(songAudioTable)
      .values({
        songId: input.songId,
        mp3,
        byteLength: mp3.byteLength,
        contentType: input.contentType,
      })
      .onConflictDoUpdate({
        target: songAudioTable.songId,
        set: {
          mp3,
          byteLength: mp3.byteLength,
          contentType: input.contentType,
        },
      })
  }

export const makeFindSongAudio =
  (db: Db): FindSongAudio =>
  async (songId) => {
    const rows = await db
      .select()
      .from(songAudioTable)
      .where(eq(songAudioTable.songId, songId))
      .limit(1)
    const row = rows[0]
    if (row === undefined) return null
    return Object.freeze({ mp3: new Uint8Array(row.mp3), contentType: row.contentType })
  }

export const makeMarkSongRunning =
  (db: Db): MarkSongRunning =>
  async (songId) => {
    await db
      .update(songsTable)
      .set({
        stage: "plan",
        stageCompleted: null,
        stageTotal: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(songsTable.id, songId))
  }

export const makeMarkSongStage =
  (db: Db): MarkSongStage =>
  async (songId, stage) => {
    await db
      .update(songsTable)
      .set({
        stage,
        stageCompleted: null,
        stageTotal: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(songsTable.id, songId))
  }

export const makeMarkSongProgress =
  (db: Db): MarkSongProgress =>
  async (songId, progress) => {
    await db
      .update(songsTable)
      .set({
        stageCompleted: progress.completed,
        stageTotal: progress.total,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(songsTable.id, songId))
  }

export const makeMarkSongComplete =
  (db: Db): MarkSongComplete =>
  async (input) => {
    const now = new Date().toISOString()
    await db
      .update(songsTable)
      .set({
        status: "complete",
        stage: null,
        stageCompleted: null,
        stageTotal: null,
        scoreAbc: input.scoreAbc,
        durationSeconds: input.durationSeconds,
        truncatedAbc: input.truncated.abc,
        truncatedSemantic: input.truncated.semantic,
        errorDetail: null,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(songsTable.id, input.songId))
  }

export const makeMarkSongFailed =
  (db: Db): MarkSongFailed =>
  async (songId, errorDetail) => {
    const now = new Date().toISOString()
    await db
      .update(songsTable)
      .set({
        status: "failed",
        stage: null,
        stageCompleted: null,
        stageTotal: null,
        errorDetail,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(songsTable.id, songId))
  }

export const makeClaimNextQueuedSong =
  (db: Db): ClaimNextQueuedSong =>
  async () =>
    db.transaction(async (tx) => {
      const candidates = await tx
        .select()
        .from(songsTable)
        .where(eq(songsTable.status, "queued"))
        .orderBy(asc(songsTable.createdAt), asc(songsTable.id))
        .limit(1)
      const candidate = candidates[0]
      if (candidate === undefined) return null

      const now = new Date().toISOString()
      await tx
        .update(songsTable)
        .set({
          status: "running",
          stage: null,
          stageCompleted: null,
          stageTotal: null,
          updatedAt: now,
        })
        .where(and(eq(songsTable.id, candidate.id), eq(songsTable.status, "queued")))

      return toSong({
        ...candidate,
        status: "running",
        stage: null,
        stageCompleted: null,
        stageTotal: null,
        updatedAt: now,
      })
    })

export const makeDeleteSong =
  (db: Db): DeleteSong =>
  async (songId) => {
    const rows = await db
      .delete(songsTable)
      .where(eq(songsTable.id, songId))
      .returning({ id: songsTable.id })
    return rows.length > 0
  }

export const makeRecoverInterruptedSongs =
  (db: Db): RecoverInterruptedSongs =>
  async () => {
    const now = new Date().toISOString()
    const rows = await db
      .update(songsTable)
      .set({
        status: "failed",
        stage: null,
        stageCompleted: null,
        stageTotal: null,
        errorDetail: interruptedErrorDetail,
        updatedAt: now,
        completedAt: now,
      })
      .where(eq(songsTable.status, "running"))
      .returning({ id: songsTable.id })
    return rows.length
  }
