import { z } from "zod"
import { MissingModelSchema, ModelKeySchema } from "./models"

export const PROBLEM_TYPES = {
  validationError: "https://yuekbox.local/problems/validation-error",
  internalError: "https://yuekbox.local/problems/internal-error",
  notFound: "https://yuekbox.local/problems/not-found",
  conflict: "https://yuekbox.local/problems/conflict",
  upstreamError: "https://yuekbox.local/problems/upstream-error",
  modelRequired: "https://yuekbox.local/problems/model-required",
  confirmationRequired: "https://yuekbox.local/problems/download-confirmation-required",
  modelPathExternal: "https://yuekbox.local/problems/model-path-external",
} as const

export const ProblemErrorSchema = z.strictObject({
  pointer: z.string().min(1),
  code: z.string().min(1),
})

const InternalProblemFieldsSchema = z.strictObject({
  title: z.string().min(1),
  status: z.number().int().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
})

export const ValidationProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.validationError),
  errors: z.array(ProblemErrorSchema).min(1),
})

export const InternalProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.internalError),
})

export const NotFoundProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.notFound),
})

export const ConflictProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.conflict),
})

export const UpstreamProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.upstreamError),
})

/**
 * A generation cannot start until the named models are on disk. The dialog
 * offers a download when `downloadable` is true, else a folder choice.
 */
export const ModelRequiredProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.modelRequired),
  models: z.array(MissingModelSchema).min(1),
})

/**
 * A download over the confirmation threshold was requested without the user's
 * acknowledgement. `expectedBytes` is what the download will put on disk.
 */
export const ConfirmationRequiredProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.confirmationRequired),
  expectedBytes: z.number().int().positive(),
  thresholdBytes: z.number().int().nonnegative(),
})

/**
 * The model's resolved path is outside yuekbox's own models folder, so
 * yuekbox refuses to download into it; the user picks a folder instead.
 */
export const ModelPathExternalProblemSchema = z.strictObject({
  ...InternalProblemFieldsSchema.shape,
  type: z.literal(PROBLEM_TYPES.modelPathExternal),
  key: ModelKeySchema,
  path: z.string().min(1),
})

export const ProblemDetailsSchema = z.discriminatedUnion("type", [
  ValidationProblemSchema,
  InternalProblemSchema,
  NotFoundProblemSchema,
  ConflictProblemSchema,
  UpstreamProblemSchema,
  ModelRequiredProblemSchema,
  ConfirmationRequiredProblemSchema,
  ModelPathExternalProblemSchema,
])

export type ProblemError = z.infer<typeof ProblemErrorSchema>
export type ValidationProblem = z.infer<typeof ValidationProblemSchema>
export type InternalProblem = z.infer<typeof InternalProblemSchema>
export type NotFoundProblem = z.infer<typeof NotFoundProblemSchema>
export type ConflictProblem = z.infer<typeof ConflictProblemSchema>
export type UpstreamProblem = z.infer<typeof UpstreamProblemSchema>
export type ModelRequiredProblem = z.infer<typeof ModelRequiredProblemSchema>
export type ConfirmationRequiredProblem = z.infer<typeof ConfirmationRequiredProblemSchema>
export type ModelPathExternalProblem = z.infer<typeof ModelPathExternalProblemSchema>
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>
