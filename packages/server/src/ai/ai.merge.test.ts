import { describe, expect, test } from "bun:test"
import { mergeStored } from "./ai.merge"
import { defaultStoredConfig } from "./ai.models"

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
    const written = mergeStored(defaultStoredConfig(), {
      style: { apiKey: "sk-secret-abc" },
    })
    expect(written.style.apiKey).toBe("sk-secret-abc")
    const cleared = mergeStored(written, { style: { apiKey: "" } })
    expect(cleared.style.apiKey).toBeNull()
  })

  test("omitted apiKey keeps the stored key", () => {
    const written = mergeStored(defaultStoredConfig(), {
      style: { apiKey: "sk-secret-abc" },
    })
    const remerged = mergeStored(written, { style: { model: "gpt-4o" } })
    expect(remerged.style.apiKey).toBe("sk-secret-abc")
  })

  test("invalid patch sections are ignored", () => {
    const merged = mergeStored(defaultStoredConfig(), {
      style: { baseUrl: "not-a-url" },
    })
    expect(merged.style.baseUrl).toBe(defaultStoredConfig().style.baseUrl)
  })

  test("visuals patches merge like the other writers", () => {
    const merged = mergeStored(defaultStoredConfig(), {
      visuals: { model: "canvas-model", apiKey: "sk-vis" },
    })
    expect(merged.visuals.model).toBe("canvas-model")
    expect(merged.visuals.apiKey).toBe("sk-vis")
    expect(merged.style.model).toBe("")
  })
})
