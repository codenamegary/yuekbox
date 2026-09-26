import { z } from "zod"

export const configPath = "/v1/config"

const ModelPathSchema = z.string().trim().min(1)

/** The five model locations the user owns. Nothing else is configurable. */
export const ModelPathsSchema = z.strictObject({
  yue2: ModelPathSchema,
  yue2Vae: ModelPathSchema,
  sheetsage2: ModelPathSchema,
  sheetsage2Base: ModelPathSchema,
  whisper: ModelPathSchema,
})
export type ModelPaths = z.infer<typeof ModelPathsSchema>

/**
 * A partial write to the stored model paths. Missing keys keep their stored
 * value, and null resets a key to its default folder.
 */
export const ModelPathOverridesSchema = ModelPathsSchema.partial().extend(
  Object.fromEntries(
    Object.keys(ModelPathsSchema.shape).map((key) => [key, ModelPathSchema.nullish()]),
  ) as {
    [K in keyof typeof ModelPathsSchema.shape]: z.ZodOptional<
      z.ZodNullable<(typeof ModelPathsSchema.shape)[K]>
    >
  },
)
export type ModelPathOverrides = z.infer<typeof ModelPathOverridesSchema>

export const ConfigSchema = z.strictObject({
  models: ModelPathsSchema,
})
export type Config = z.infer<typeof ConfigSchema>

export const ConfigPatchSchema = z.strictObject({
  models: ModelPathOverridesSchema,
})
export type ConfigPatch = z.infer<typeof ConfigPatchSchema>
