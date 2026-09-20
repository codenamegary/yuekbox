import { describe, expect, test } from "bun:test"
import { openDatabase } from "../db/client"
import { defaultStoredConfig, makeAiConfigStore } from "./ai.config.store"
import { toWireConfig } from "./ai.merge"

const memoryDb = () => openDatabase({ path: ":memory:" }).db

describe("makeAiConfigStore", () => {
  test("loads defaults (AI disabled, no keys) when nothing is stored", async () => {
    const store = makeAiConfigStore(memoryDb())
    const config = await store.load()
    expect(config.enabled).toBe(false)
    expect(toWireConfig(defaultStoredConfig())).toEqual(config)
    expect(config.style.keyHint).toBeNull()
  })

  test("save persists and reloads, hiding the key behind a hint", async () => {
    const db = memoryDb()
    const store = makeAiConfigStore(db, () => "2026-01-01T00:00:00.000Z")
    const saved = await store.save({
      enabled: true,
      style: { apiKey: "sk-test-abcd", model: "gpt-4o" },
    })
    expect(saved.enabled).toBe(true)
    expect(saved.style.keyHint).toBe("···abcd")
    expect(JSON.stringify(saved)).not.toContain("sk-test-abcd")

    const internal = await makeAiConfigStore(db).loadInternal()
    expect(internal.style.apiKey).toBe("sk-test-abcd")
    expect(internal.style.model).toBe("gpt-4o")
  })

  test("save merges patches without clobbering untouched sections", async () => {
    const store = makeAiConfigStore(memoryDb())
    await store.save({
      enabled: true,
      style: { model: "gpt-4o", apiKey: "sk-a" },
    })
    const after = await store.save({
      lyrics: { model: "gemini-2.5-pro", apiKey: "sk-b" },
    })
    expect(after.style.model).toBe("gpt-4o")
    expect(after.lyrics.model).toBe("gemini-2.5-pro")
    const internal = await store.loadInternal()
    expect(internal.style.apiKey).toBe("sk-a")
    expect(internal.lyrics.apiKey).toBe("sk-b")
  })

  test("apiKey empty string clears the key", async () => {
    const store = makeAiConfigStore(memoryDb())
    await store.save({ style: { apiKey: "sk-a" } })
    const after = await store.save({ style: { apiKey: "" } })
    expect(after.style.keyHint).toBeNull()
  })

  test("corrupted stored JSON falls back to defaults", async () => {
    const db = memoryDb()
    db.run(
      "insert into ai_config (id, value, updated_at) values ('default', '{not json', '2026-01-01')",
    )
    const config = await makeAiConfigStore(db).load()
    expect(toWireConfig(defaultStoredConfig())).toEqual(config)
  })
})
