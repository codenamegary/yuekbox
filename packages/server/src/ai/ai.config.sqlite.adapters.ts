import { eq } from "drizzle-orm"
import { AiConfigPatch } from "contracts/http/ai"
import { Db } from "../db/client"
import { aiConfigTable } from "../db/db.schema"
import { mergeStored, toWireConfig } from "./ai.merge"
import { defaultStoredConfig, parseStoredConfig, StoredConfig } from "./ai.models"
import { LoadConfig, LoadStoredConfig, SaveConfig } from "./ai.ports"

const singletonId = "default"

const readStored = async (db: Db): Promise<StoredConfig> => {
  const rows = await db.select().from(aiConfigTable).where(eq(aiConfigTable.id, singletonId))
  const raw = rows[0]?.value
  if (raw === undefined) return defaultStoredConfig()
  try {
    return parseStoredConfig(JSON.parse(raw))
  } catch {
    return defaultStoredConfig()
  }
}

/**
 * AI settings live in a single SQLite row as JSON, API keys included. The key
 * never leaves the server: load hands back key hints, while the stored-config
 * port exists for the OpenAI calls only.
 */
export const makeLoadConfig =
  (db: Db): LoadConfig =>
  async () =>
    toWireConfig(await readStored(db))

export const makeLoadStoredConfig =
  (db: Db): LoadStoredConfig =>
  async () =>
    readStored(db)

export const makeSaveConfig =
  (db: Db, now: () => string = () => new Date().toISOString()): SaveConfig =>
  async (patch: AiConfigPatch) => {
    const current = await readStored(db)
    const next = mergeStored(current, patch)
    await db
      .insert(aiConfigTable)
      .values({ id: singletonId, value: JSON.stringify(next), updatedAt: now() })
      .onConflictDoUpdate({
        target: aiConfigTable.id,
        set: { value: JSON.stringify(next), updatedAt: now() },
      })
    return toWireConfig(next)
  }
