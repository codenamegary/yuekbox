import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const songsTable = sqliteTable("songs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  stage: text("stage"),
  stageCompleted: integer("stage_completed"),
  stageTotal: integer("stage_total"),
  lyrics: text("lyrics").notNull(),
  style: text("style").notNull(),
  title: text("title").notNull(),
  seed: integer("seed").notNull(),
  cot: text("cot").notNull().default("full"),
  durationSeconds: real("duration_seconds"),
  truncatedAbc: integer("truncated_abc", { mode: "boolean" }),
  truncatedSemantic: integer("truncated_semantic", { mode: "boolean" }),
  errorDetail: text("error_detail"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
})

export const aiConfigTable = sqliteTable("ai_config", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
})
