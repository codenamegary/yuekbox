import { z } from "zod"

export const aiPresetsPath = "/v1/ai/presets"
export const aiConfigPath = "/v1/ai/config"
export const aiModelsPath = "/v1/ai/models"
export const aiEnhancePath = "/v1/ai/enhance"
export const aiRandomSongPath = "/v1/ai/songs/random"

export const EffortLevelSchema = z.enum(["off", "low", "medium", "high"])
export type EffortLevel = z.infer<typeof EffortLevelSchema>

export const effortLevels: readonly EffortLevel[] = ["off", "low", "medium", "high"]

export const EnhanceScopeSchema = z.enum(["style", "lyrics"])
export type EnhanceScope = z.infer<typeof EnhanceScopeSchema>

export const PresetSchema = z.strictObject({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  icon: z.string().min(1).max(64),
  /** Empty for the custom preset: the user types their own. */
  baseUrl: z.string().max(200),
  needsKey: z.boolean(),
  defaultModels: z.array(z.string().min(1).max(128)).max(200),
})
export type Preset = z.infer<typeof PresetSchema>

export const AiPresetsSchema = z.strictObject({
  presets: z.array(PresetSchema).max(32),
})
export type AiPresets = z.infer<typeof AiPresetsSchema>

export const BaseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "base URL must start with http:// or https://",
  })

/** One writer's settings, as seen by the wire. The key itself never leaves the server. */
export const SettingSchema = z.strictObject({
  presetId: z.string().min(1).max(64),
  baseUrl: BaseUrlSchema,
  model: z.string().max(128),
  effort: EffortLevelSchema,
  keyHint: z.string().max(16).nullable(),
})
export type Setting = z.infer<typeof SettingSchema>

export const AiConfigSchema = z.strictObject({
  enabled: z.boolean(),
  style: SettingSchema,
  lyrics: SettingSchema,
})
export type AiConfig = z.infer<typeof AiConfigSchema>

export const SettingPatchSchema = z.strictObject({
  presetId: z.string().min(1).max(64).optional(),
  baseUrl: BaseUrlSchema.optional(),
  model: z.string().max(128).optional(),
  effort: EffortLevelSchema.optional(),
  apiKey: z.string().max(400).optional(),
})
export type SettingPatch = z.infer<typeof SettingPatchSchema>

export const AiConfigPatchSchema = z.strictObject({
  enabled: z.boolean().optional(),
  style: SettingPatchSchema.optional(),
  lyrics: SettingPatchSchema.optional(),
})
export type AiConfigPatch = z.infer<typeof AiConfigPatchSchema>

export const AiModelsSchema = z.strictObject({
  models: z.array(z.string().min(1).max(128)).max(200),
  live: z.boolean(),
  detail: z.string().optional(),
})
export type AiModels = z.infer<typeof AiModelsSchema>

export const EnhanceBodySchema = z.strictObject({
  kind: EnhanceScopeSchema,
  style: z.string().max(2000).optional(),
  lyrics: z.string().max(20000).optional(),
})
export type EnhanceBody = z.infer<typeof EnhanceBodySchema>

export const EnhanceResultSchema = z.strictObject({
  text: z.string().min(1).max(40000),
})
export type EnhanceResult = z.infer<typeof EnhanceResultSchema>
