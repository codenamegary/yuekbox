import { z } from "zod"

export const readinessPath = "/v1/readiness"

/** Whether a model is on disk or a machine prerequisite is satisfied. */
export const ReadinessStateSchema = z.enum(["ready", "missing"])

/**
 * One of the five user-configurable models. `size` is the bytes on disk when
 * the model is present, and the expected download size when it is missing.
 */
export const ModelReadinessSchema = z.strictObject({
  state: ReadinessStateSchema,
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
})
export type ModelReadiness = z.infer<typeof ModelReadinessSchema>

export const ModelsReadinessSchema = z.strictObject({
  yue2: ModelReadinessSchema,
  yue2Vae: ModelReadinessSchema,
  sheetsage2: ModelReadinessSchema,
  sheetsage2Base: ModelReadinessSchema,
  whisper: ModelReadinessSchema,
})
export type ModelsReadiness = z.infer<typeof ModelsReadinessSchema>

/** The copy-paste install instructions a failed machine check carries. */
export const SystemFixSchema = z.strictObject({
  linux: z.string().min(1),
  wsl2: z.string().min(1),
})
export type SystemFix = z.infer<typeof SystemFixSchema>

/**
 * A machine prerequisite. Informational only: a failure carries a short
 * message and the install instruction for Linux and WSL2, never a config row.
 */
export const SystemCheckSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("ready") }),
  z.strictObject({
    state: z.literal("missing"),
    message: z.string().min(1),
    fix: SystemFixSchema,
  }),
])
export type SystemCheck = z.infer<typeof SystemCheckSchema>

export const SystemReadinessSchema = z.strictObject({
  ffmpeg: SystemCheckSchema,
  nvidia: SystemCheckSchema,
})
export type SystemReadiness = z.infer<typeof SystemReadinessSchema>

/** Model readiness plus the system preflight. No runtime or venv state. */
export const ReadinessSchema = z.strictObject({
  models: ModelsReadinessSchema,
  system: SystemReadinessSchema,
})
export type Readiness = z.infer<typeof ReadinessSchema>
