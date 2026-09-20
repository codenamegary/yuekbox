import { eq } from "drizzle-orm"
import { AiConfigPatch, EffortLevelSchema } from "contracts/http/ai"
import { Db } from "../db/client"
import { aiConfigTable } from "../db/db.schema"
import { mergeStored, toWireConfig } from "./ai.merge"
import { AiConfigStore, StoredConfig, StoredSetting } from "./ai.models"

const singletonId = "default"

const fallbackSetting = (): StoredSetting => ({
  presetId: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: null,
  model: "",
  effort: "medium",
})

/** AI ships disabled and unconfigured; the boxes stay exactly as they were. */
export const defaultStoredConfig = (): StoredConfig => ({
  enabled: false,
  style: fallbackSetting(),
  lyrics: fallbackSetting(),
})

const storedSetting = (value: unknown): StoredSetting => {
  if (typeof value !== "object" || value === null) return fallbackSetting()
  const record = value as Record<string, unknown>
  const effort = EffortLevelSchema.safeParse(record.effort)
  return {
    presetId: typeof record.presetId === "string" ? record.presetId : "openai",
    baseUrl:
      typeof record.baseUrl === "string" && record.baseUrl !== ""
        ? record.baseUrl
        : "https://api.openai.com/v1",
    apiKey: typeof record.apiKey === "string" && record.apiKey !== "" ? record.apiKey : null,
    model: typeof record.model === "string" ? record.model : "",
    effort: effort.success ? effort.data : "medium",
  }
}

const storedConfig = (value: unknown): StoredConfig => {
  if (typeof value !== "object" || value === null) return defaultStoredConfig()
  const record = value as Record<string, unknown>
  return {
    enabled: record.enabled === true,
    style: storedSetting(record.style),
    lyrics: storedSetting(record.lyrics),
  }
}

/**
 * AI settings live in a single SQLite row as JSON, API keys included. The key
 * never leaves the server: `load()` hands back key hints, `loadInternal()`
 * exists for the OpenAI calls only.
 */
export const makeAiConfigStore = (
  db: Db,
  now: () => string = () => new Date().toISOString(),
): AiConfigStore => {
  const readStored = async (): Promise<StoredConfig> => {
    const rows = await db.select().from(aiConfigTable).where(eq(aiConfigTable.id, singletonId))
    const raw = rows[0]?.value
    if (raw === undefined) return defaultStoredConfig()
    try {
      return storedConfig(JSON.parse(raw))
    } catch {
      return defaultStoredConfig()
    }
  }

  return {
    load: async () => toWireConfig(await readStored()),
    loadInternal: readStored,
    save: async (patch: AiConfigPatch) => {
      const current = await readStored()
      const next = mergeStored(current, patch)
      await db
        .insert(aiConfigTable)
        .values({ id: singletonId, value: JSON.stringify(next), updatedAt: now() })
        .onConflictDoUpdate({
          target: aiConfigTable.id,
          set: { value: JSON.stringify(next), updatedAt: now() },
        })
      return toWireConfig(next)
    },
  }
}
