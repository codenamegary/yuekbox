import { mkdir, rename, rm } from "node:fs/promises"
import { dirname } from "node:path"
import { ModelPathOverrides } from "contracts/http/config"
import { ConfigFileSchema } from "./config.models"
import { LoadModelOverrides, SaveModelOverrides } from "./config.ports"

/** Parses YAML, mapping a parse failure to a plain-language error. */
const parseYaml = (text: string): unknown => {
  try {
    return Bun.YAML.parse(text)
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`config file is not valid YAML: ${detail}`)
  }
}

/** Empty files and a bare `models:` line mean "no overrides", never an error. */
export const parseConfigFile = (text: string): ModelPathOverrides => {
  if (text.trim() === "") return {}

  const value = parseYaml(text)

  const parsed = ConfigFileSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`config file did not match the expected shape: ${parsed.error.message}`)
  }
  return parsed.data.models ?? {}
}

export const makeLoadModelOverrides =
  (configPath: string): LoadModelOverrides =>
  async () => {
    const file = Bun.file(configPath)
    if (!(await file.exists())) return {}
    try {
      return parseConfigFile(await file.text())
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`${configPath}: ${detail}`)
    }
  }

export const makeSaveModelOverrides =
  (configPath: string): SaveModelOverrides =>
  async (overrides) => {
    await mkdir(dirname(configPath), { recursive: true })
    const tempPath = `${configPath}.tmp`
    try {
      await Bun.write(tempPath, Bun.YAML.stringify({ models: overrides }, null, 2))
      await rename(tempPath, configPath)
    } catch (error: unknown) {
      await rm(tempPath, { force: true })
      throw error
    }
  }
