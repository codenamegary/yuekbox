import { blob, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const songsTable = sqliteTable("songs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  stage: text("stage"),
  stageCompleted: integer("stage_completed"),
  stageTotal: integer("stage_total"),
  lyrics: text("lyrics").notNull(),
  style: text("style").notNull(),
  seed: integer("seed").notNull(),
  cot: text("cot").notNull().default("full"),
  scoreAbc: text("score_abc"),
  durationSeconds: real("duration_seconds"),
  truncatedAbc: integer("truncated_abc", { mode: "boolean" }),
  truncatedSemantic: integer("truncated_semantic", { mode: "boolean" }),
  errorDetail: text("error_detail"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
})

export const songAudioTable = sqliteTable("song_audio", {
  songId: text("song_id")
    .primaryKey()
    .references(() => songsTable.id, { onDelete: "cascade" }),
  mp3: blob("mp3", { mode: "buffer" }).notNull(),
  byteLength: integer("byte_length").notNull(),
  contentType: text("content_type").notNull(),
})
