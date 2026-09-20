import { z } from "zod"

export const songVisualizationPath = (songId: string) => `/v1/songs/${songId}/visualization`

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
