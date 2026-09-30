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

/**
 * The copy-paste install instructions a failed machine check carries, per
 * platform. A check carries only the platforms its fix applies to, and at
 * least one.
 */
export const SystemFixSchema = z
  .strictObject({
    linux: z.string().min(1).optional(),
    wsl2: z.string().min(1).optional(),
    macos: z.string().min(1).optional(),
  })
  .refine(
    (fix) => fix.linux !== undefined || fix.wsl2 !== undefined || fix.macos !== undefined,
    "a fix names at least one platform",
  )
export type SystemFix = z.infer<typeof SystemFixSchema>

/**
 * A machine prerequisite. Informational only: a failure carries a short
 * message and the install instruction for the machines it applies to, never
 * a config row.
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
  /** The GPU the machine needs: NVIDIA on Linux and WSL2, Apple Silicon on macOS. */
  gpu: SystemCheckSchema,
})
export type SystemReadiness = z.infer<typeof SystemReadinessSchema>

/** Model readiness plus the system preflight. No runtime or venv state. */
export const ReadinessSchema = z.strictObject({
  models: ModelsReadinessSchema,
  system: SystemReadinessSchema,
})
export type Readiness = z.infer<typeof ReadinessSchema>
