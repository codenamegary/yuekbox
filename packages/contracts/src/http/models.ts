import { z } from "zod"

export const modelsPath = "/v1/models"
export const modelsDownloadsPath = `${modelsPath}/downloads`
export const modelDownloadPath = (key: string) => `${modelsPath}/${key}/download`

/** The five user-configurable models, the same keys readiness reports. */
export const ModelKeySchema = z.enum(["yue2", "yue2Vae", "sheetsage2", "sheetsage2Base", "whisper"])
export type ModelKey = z.infer<typeof ModelKeySchema>

/**
 * Life of a model on this machine:
 * - `idle`: missing, no download attempted in this process
 * - `preparing`: downloading, listing the pinned repository's files
 * - `downloading`: downloading, files in flight
 * - `failed`: the last attempt stopped; `errorDetail` says why
 * - `present`: the model is on disk
 */
export const ModelDownloadStateSchema = z.enum([
  "idle",
  "preparing",
  "downloading",
  "failed",
  "present",
])
export type ModelDownloadState = z.infer<typeof ModelDownloadStateSchema>

/**
 * One model's download state. `bytesDone` and `totalBytes` drive a progress
 * bar; `currentFile` names the file in flight. Progress lives in process
 * memory, so a restart reports `idle` (or `present`) and a new start resumes
 * from the files already fetched.
 */
export const ModelDownloadSnapshotSchema = z
  .strictObject({
    key: ModelKeySchema,
    state: ModelDownloadStateSchema,
    path: z.string().min(1),
    totalBytes: z.number().int().nonnegative(),
    bytesDone: z.number().int().nonnegative(),
    currentFile: z.string().min(1).nullable(),
    errorDetail: z.string().min(1).optional(),
  })
  .superRefine((snapshot, ctx) => {
    if (snapshot.state === "failed" && snapshot.errorDetail === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "errorDetail is required when the download failed",
        path: ["errorDetail"],
      })
    }
    if (snapshot.state !== "failed" && snapshot.errorDetail !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "errorDetail is only present when the download failed",
        path: ["errorDetail"],
      })
    }
    if (snapshot.bytesDone > snapshot.totalBytes) {
      ctx.addIssue({
        code: "custom",
        message: "bytesDone must not exceed totalBytes",
        path: ["bytesDone"],
      })
    }
  })
export type ModelDownloadSnapshot = z.infer<typeof ModelDownloadSnapshotSchema>

/**
 * The start request. `confirm` is the user's explicit acknowledgement that
 * this is a multi-gigabyte download; the server rejects a start over its
 * threshold without it.
 */
export const ModelDownloadStartSchema = z.strictObject({
  confirm: z.boolean().default(false),
})
export type ModelDownloadStart = z.infer<typeof ModelDownloadStartSchema>

export const ModelDownloadsSchema = z.strictObject({
  items: z.array(ModelDownloadSnapshotSchema),
})
export type ModelDownloads = z.infer<typeof ModelDownloadsSchema>

/**
 * A model a generation needs that is not on disk. `path` is where the app
 * looked; `downloadable` is false when the user configured that path outside
 * yuekbox's own models folder, where yuekbox refuses to write.
 */
export const MissingModelSchema = z.strictObject({
  key: ModelKeySchema,
  name: z.string().min(1),
  path: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  downloadable: z.boolean(),
})
export type MissingModel = z.infer<typeof MissingModelSchema>
