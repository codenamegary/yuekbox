import { describe, expect, test } from "bun:test"
import { mergeStored } from "./ai.merge"
import { defaultStoredConfig } from "./ai.config.sqlite.adapters"

describe("mergeStored", () => {
  test("keeps base when patch is empty", () => {
    const base = defaultStoredConfig()
    const merged = mergeStored(base, {})
    expect(merged).toEqual(base)
  })

  test("flips enabled only", () => {
    const merged = mergeStored(defaultStoredConfig(), { enabled: true })
    expect(merged.enabled).toBe(true)
    expect(merged.style).toEqual(defaultStoredConfig().style)
  })

  test("patch fields overwrite; omitted fields stay", () => {
    const merged = mergeStored(defaultStoredConfig(), {
      style: { model: "gpt-4o", effort: "high" },
    })
    expect(merged.style.model).toBe("gpt-4o")
    expect(merged.style.effort).toBe("high")
    expect(merged.style.baseUrl).toBe(defaultStoredConfig().style.baseUrl)
    expect(merged.lyrics.model).toBe("")
  })

  test("apiKey writes and clears", () => {
    let stored = mergeStored(defaultStoredConfig(), {
      style: { apiKey: "sk-secret-abc" },
    })
    expect(stored.style.apiKey).toBe("sk-secret-abc")
    stored = mergeStored(stored, { style: { apiKey: "" } })
    expect(stored.style.apiKey).toBeNull()
  })

  test("omitted apiKey keeps the stored key", () => {
    let stored = mergeStored(defaultStoredConfig(), {
      style: { apiKey: "sk-secret-abc" },
    })
    stored = mergeStored(stored, { style: { model: "gpt-4o" } })
    expect(stored.style.apiKey).toBe("sk-secret-abc")
  })

  test("invalid patch sections are ignored", () => {
    const merged = mergeStored(defaultStoredConfig(), {
      style: { baseUrl: "not-a-url" },
    })
    expect(merged.style.baseUrl).toBe(defaultStoredConfig().style.baseUrl)
  })
})
