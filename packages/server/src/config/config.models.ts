import { z } from "zod"
import { ModelPathOverridesSchema } from "contracts/http/config"

/**
 * config.yaml shape: a `models` block with any subset of the five model paths.
 * Unknown keys fail loud so a typo never silently falls back to a default.
 */
export const ConfigFileSchema = z.strictObject({
  models: ModelPathOverridesSchema.nullish(),
})

export type ConfigFile = z.infer<typeof ConfigFileSchema>
