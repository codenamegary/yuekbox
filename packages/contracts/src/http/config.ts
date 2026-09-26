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

/** A partial write to the stored model paths. Missing keys keep their stored value. */
export const ModelPathOverridesSchema = z.strictObject({
  yue2: ModelPathSchema.optional(),
  yue2Vae: ModelPathSchema.optional(),
  sheetsage2: ModelPathSchema.optional(),
  sheetsage2Base: ModelPathSchema.optional(),
  whisper: ModelPathSchema.optional(),
})
export type ModelPathOverrides = z.infer<typeof ModelPathOverridesSchema>

export const ConfigSchema = z.strictObject({
  models: ModelPathsSchema,
})
export type Config = z.infer<typeof ConfigSchema>

export const ConfigPatchSchema = z.strictObject({
  models: ModelPathOverridesSchema,
})
export type ConfigPatch = z.infer<typeof ConfigPatchSchema>
