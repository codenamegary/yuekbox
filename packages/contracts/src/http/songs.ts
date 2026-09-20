import { z } from "zod"
import { createCollectionSchema } from "./collection"
import { CursorSchema, TimestampSchema, UlidSchema } from "./primitives"
import { ReferenceSummarySchema } from "./references"

export const songsPath = "/v1/songs"
export const songPath = (songId: string) => `/v1/songs/${songId}`
export const songAudioPath = (songId: string) => `/v1/songs/${songId}/audio`

export const SongStatusSchema = z.enum(["queued", "running", "complete", "failed"])
export const SongStageSchema = z.enum([
  "transcribe",
  "plan",
  "semantic",
  "synthesize",
  "decode",
  "encode",
])

export const CreateSongBodySchema = z.strictObject({
  lyrics: z.string().trim().min(1).max(20000),
  style: z.string().trim().min(1).max(2000),
  referenceId: UlidSchema.optional(),
  seed: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31 - 1)
    .optional(),
})

export const TruncatedSchema = z.strictObject({
  abc: z.boolean(),
  semantic: z.boolean(),
})

export const StageProgressSchema = z.strictObject({
  completed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
})

export const SongSchema = z
  .strictObject({
    id: UlidSchema,
    status: SongStatusSchema,
    stage: SongStageSchema.optional(),
    stageProgress: StageProgressSchema.optional(),
    lyrics: z.string(),
    style: z.string(),
    seed: z.number().int(),
    reference: ReferenceSummarySchema.optional(),
    durationSeconds: z.number().nonnegative().optional(),
    truncated: TruncatedSchema.optional(),
    scoreAbc: z.string().optional(),
    errorDetail: z.string().optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    completedAt: TimestampSchema.optional(),
  })
  .superRefine((song, ctx) => {
    const running = song.status === "running"
    const complete = song.status === "complete"
    const failed = song.status === "failed"

    if (running && song.stage === undefined) {
      ctx.addIssue({ code: "custom", message: "stage is required while running", path: ["stage"] })
    }
    if (!running && song.stage !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "stage is only present while running",
        path: ["stage"],
      })
    }
    if (!running && song.stageProgress !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "stageProgress is only present while running",
        path: ["stageProgress"],
      })
    }
    if (
      song.stageProgress !== undefined &&
      song.stageProgress.completed > song.stageProgress.total
    ) {
      ctx.addIssue({
        code: "custom",
        message: "stageProgress completed must not exceed total",
        path: ["stageProgress", "completed"],
      })
    }
    if (!running && song.stage !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "stage is only present while running",
        path: ["stage"],
      })
    }

    const hasCompleteFields = song.durationSeconds !== undefined || song.truncated !== undefined
    if (complete && !hasCompleteFields) {
      ctx.addIssue({
        code: "custom",
        message: "durationSeconds and truncated are required when complete",
        path: ["durationSeconds"],
      })
    }
    if (!complete && hasCompleteFields) {
      ctx.addIssue({
        code: "custom",
        message: "durationSeconds and truncated are only present when complete",
        path: ["durationSeconds"],
      })
    }

    if (song.scoreAbc !== undefined && !complete) {
      ctx.addIssue({
        code: "custom",
        message: "scoreAbc is only present when complete",
        path: ["scoreAbc"],
      })
    }

    if (failed && song.errorDetail === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "errorDetail is required when failed",
        path: ["errorDetail"],
      })
    }
    if (!failed && song.errorDetail !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "errorDetail is only present when failed",
        path: ["errorDetail"],
      })
    }

    const hasCompletedAt = song.completedAt !== undefined
    if ((complete || failed) !== hasCompletedAt) {
      ctx.addIssue({
        code: "custom",
        message: "completedAt is present only when complete or failed",
        path: ["completedAt"],
      })
    }
  })

const normalizeRepeated = (value: unknown) => {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value : [value]
}

export const SongsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: CursorSchema.optional(),
  status: z.preprocess(normalizeRepeated, z.array(SongStatusSchema).min(1).optional()),
})

export const SongsCollectionSchema = createCollectionSchema(SongSchema)

export type SongStatus = z.infer<typeof SongStatusSchema>
export type SongStage = z.infer<typeof SongStageSchema>
export type CreateSongBody = z.infer<typeof CreateSongBodySchema>
export type Truncated = z.infer<typeof TruncatedSchema>
export type StageProgress = z.infer<typeof StageProgressSchema>
export type Song = z.infer<typeof SongSchema>
export type SongsQuery = z.infer<typeof SongsQuerySchema>
export type SongsCollection = z.infer<typeof SongsCollectionSchema>
