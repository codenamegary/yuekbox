import { z } from "zod"

export const songVisualizationPath = (songId: string) => `/v1/songs/${songId}/visualization`

/** One transcribed vocal note. Pitch is a MIDI note number. */
export const AnalysisNoteSchema = z
  .strictObject({
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().nonnegative(),
    pitch: z.number().int().min(0).max(127),
  })
  .refine((note) => note.endSeconds > note.startSeconds, {
    message: "a note must end after it starts",
    path: ["endSeconds"],
  })

/** One measured beat. Position is 1-based inside the bar, so position 1 is a downbeat. */
export const AnalysisBeatSchema = z
  .strictObject({
    time: z.number().nonnegative(),
    position: z.number().int().min(1),
    beatsPerBar: z.number().int().min(1),
    beatUnit: z.number().int().min(1),
  })
  .refine((beat) => beat.position <= beat.beatsPerBar, {
    message: "a beat position must sit inside its bar",
    path: ["position"],
  })

/** A measured section from SheetSage2's fixed vocabulary (intro, verse, chorus, ...). */
export const AnalysisSectionSchema = z
  .strictObject({
    name: z.string().min(1),
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().nonnegative(),
  })
  .refine((section) => section.endSeconds > section.startSeconds, {
    message: "a section must end after it starts",
    path: ["endSeconds"],
  })

/**
 * The measured score of a rendered Song: notes with pitch, a beat grid, and
 * section boundaries. Empty arrays are legal; a Song may have no vocal notes.
 */
export const SongAnalysisSchema = z.strictObject({
  version: z.literal(1),
  source: z.literal("sheetsage2"),
  notes: z.array(AnalysisNoteSchema),
  beats: z.array(AnalysisBeatSchema),
  sections: z.array(AnalysisSectionSchema),
})

export const VisualizationStatusSchema = z.enum(["pending", "ready", "failed", "rerolling"])
export type VisualizationStatus = z.infer<typeof VisualizationStatusSchema>

/**
 * The active Song's visualization, as the backdrop needs it.
 *
 * - `ready` / `rerolling` carry the code that is on disk and its checksum.
 *   `rerolling` means a run is in flight while that code keeps playing.
 * - `pending` means no code yet and a run is in flight.
 * - `failed` means no code and the last run failed.
 */
export const SongVisualizationSchema = z
  .strictObject({
    status: VisualizationStatusSchema,
    code: z.string().min(1).optional(),
    checksum: z.string().min(1).optional(),
    errorDetail: z.string().min(1).max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    const carriesCode = value.status === "ready" || value.status === "rerolling"
    if (carriesCode && (value.code === undefined || value.checksum === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "code and checksum are required while a visual exists",
        path: ["code"],
      })
    }
    if (!carriesCode && (value.code !== undefined || value.checksum !== undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "code and checksum are only present while a visual exists",
        path: ["code"],
      })
    }
    if (value.status === "failed" && value.errorDetail === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "errorDetail is required when failed",
        path: ["errorDetail"],
      })
    }
    if (value.status !== "failed" && value.errorDetail !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "errorDetail is only present when failed",
        path: ["errorDetail"],
      })
    }
  })
export type SongVisualization = z.infer<typeof SongVisualizationSchema>

/**
 * The route's payload: the visual that may be rerolled, alongside the measured
 * analysis that never changes. Both are null when a Song has neither.
 */
export const SongVisualizationResponseSchema = z.strictObject({
  visualization: SongVisualizationSchema.nullable(),
  analysis: SongAnalysisSchema.nullable(),
})
export type SongAnalysis = z.infer<typeof SongAnalysisSchema>
export type AnalysisNote = z.infer<typeof AnalysisNoteSchema>
export type AnalysisBeat = z.infer<typeof AnalysisBeatSchema>
export type AnalysisSection = z.infer<typeof AnalysisSectionSchema>
export type SongVisualizationResponse = z.infer<typeof SongVisualizationResponseSchema>
