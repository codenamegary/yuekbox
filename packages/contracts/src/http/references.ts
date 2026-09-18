import { z } from "zod"
import { TimestampSchema, UlidSchema } from "./primitives"

export const referencesPath = "/v1/references"
export const referencePath = (referenceId: string) => `/v1/references/${referenceId}`

export const ReferenceFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !value.includes("/") && !value.includes("\\"), {
    message: "filename must be a plain file name without path separators",
  })

export const ReferenceSchema = z.strictObject({
  id: UlidSchema,
  filename: ReferenceFileNameSchema,
  contentType: z.string().min(1).max(255),
  byteLength: z.number().int().positive(),
  createdAt: TimestampSchema,
})

export const ReferenceSummarySchema = z.strictObject({
  id: UlidSchema,
  filename: ReferenceFileNameSchema,
})

export const ReferenceUploadQuerySchema = z.strictObject({
  filename: ReferenceFileNameSchema,
})

export type Reference = z.infer<typeof ReferenceSchema>
export type ReferenceSummary = z.infer<typeof ReferenceSummarySchema>
export type ReferenceUploadQuery = z.infer<typeof ReferenceUploadQuerySchema>
