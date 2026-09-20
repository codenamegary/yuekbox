import { describe, expect, test } from "bun:test"
import {
  AiConfigPatchSchema,
  AiConfigSchema,
  AiModelsSchema,
  AiPresetsSchema,
  EnhanceBodySchema,
  EnhanceResultSchema,
  EffortLevelSchema,
  SettingSchema,
} from "./ai"

describe("EffortLevelSchema", () => {
  test("accepts known efforts including off", () => {
    for (const effort of ["off", "low", "medium", "high"]) {
      expect(EffortLevelSchema.safeParse(effort).success).toBe(true)
    }
  })

  test("rejects unknown efforts", () => {
    expect(EffortLevelSchema.safeParse("maximum").success).toBe(false)
  })
})

describe("PresetSchema", () => {
  test("parses a provider preset", () => {
    const parsed = AiPresetsSchema.parse({
      presets: [
        {
          id: "openai",
          name: "OpenAI",
          icon: "openai",
          baseUrl: "https://api.openai.com/v1",
          needsKey: true,
          defaultModels: ["gpt-5-mini", "gpt-4o-mini"],
        },
      ],
    })
    expect(parsed.presets[0]?.needsKey).toBe(true)
  })
})

describe("SettingSchema", () => {
  test("rejects non-http base URLs", () => {
    const setting = {
      presetId: "openai",
      baseUrl: "ftp://nope",
      model: "gpt-4o-mini",
      effort: "off",
      keyHint: null,
    }
    expect(SettingSchema.safeParse(setting).success).toBe(false)
  })

  test("accepts local http endpoints and empty model", () => {
    const parsed = SettingSchema.parse({
      presetId: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "",
      effort: "low",
      keyHint: null,
    })
    expect(parsed.presetId).toBe("ollama")
  })
})

describe("AiConfigSchema", () => {
  const setting = {
    presetId: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    effort: "medium",
    keyHint: "···abcd",
  }

  test("parses a full config", () => {
    const parsed = AiConfigSchema.parse({
      enabled: true,
      style: setting,
      lyrics: setting,
    })
    expect(parsed.enabled).toBe(true)
    expect(parsed.style.keyHint).toBe("···abcd")
  })

  test("patch allows nested partials and key writes", () => {
    expect(AiConfigPatchSchema.safeParse({ enabled: true }).success).toBe(true)
    expect(AiConfigPatchSchema.safeParse({ lyrics: { apiKey: "sk-test" } }).success).toBe(true)
    expect(AiConfigPatchSchema.safeParse({ lyrics: { apiKey: 3 } }).success).toBe(false)
  })
})

describe("AiModelsSchema", () => {
  test("parses a live listing and a preset fallback", () => {
    expect(AiModelsSchema.parse({ models: ["gpt-4o"], live: true }).live).toBe(true)
    expect(AiModelsSchema.parse({ models: [], live: false, detail: "no key" }).live).toBe(false)
  })
})

describe("EnhanceBodySchema", () => {
  test("style enhance needs only kind", () => {
    const parsed = EnhanceBodySchema.parse({ kind: "style" })
    expect(parsed.kind).toBe("style")
  })

  test("lyrics enhance carries current text", () => {
    const parsed = EnhanceBodySchema.parse({ kind: "lyrics", lyrics: "[Verse]\nhi" })
    expect(parsed.style).toBeUndefined()
    expect(parsed.lyrics).toBe("[Verse]\nhi")
  })

  test("rejects unknown kinds", () => {
    expect(EnhanceBodySchema.safeParse({ kind: "vibes" }).success).toBe(false)
  })
})

describe("EnhanceResultSchema", () => {
  test("rejects empty text", () => {
    expect(EnhanceResultSchema.safeParse({ text: "" }).success).toBe(false)
    expect(EnhanceResultSchema.safeParse({ text: "dream pop" }).success).toBe(true)
  })
})
