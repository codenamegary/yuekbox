import { describe, expect, test } from "bun:test"
import { err, ok } from "../shared/result"
import { StoredConfig, StoredSetting } from "./ai.models"
import { ListModels } from "./ai.ports"
import { makeFetchModels } from "./ai.fetch-models.usecase"

const setting = (overrides: Partial<StoredSetting> = {}): StoredSetting => ({
  presetId: "custom",
  baseUrl: "http://127.0.0.1:9/v1",
  apiKey: null,
  model: "model",
  effort: "medium",
  ...overrides,
})

const storedConfig = (overrides: Partial<StoredConfig> = {}): StoredConfig => ({
  enabled: true,
  style: setting({ baseUrl: "http://127.0.0.1:9/style", apiKey: "sk-style" }),
  lyrics: setting({ baseUrl: "http://127.0.0.1:9/lyrics", apiKey: "sk-lyrics" }),
  ...overrides,
})

const makeUseCase = (listModels: ListModels, config: StoredConfig = storedConfig()) =>
  makeFetchModels({ loadStoredConfig: async () => config, listModels })

describe("makeFetchModels", () => {
  test("returns the live model list from the requested scope's endpoint", async () => {
    const seen: Array<{ baseUrl: string; apiKey: string | null }> = []
    const fetchModels = makeUseCase(async (writer) => {
      seen.push(writer)
      return ok(["gpt-4o", "gpt-4o-mini"])
    })

    const result = await fetchModels("style")

    expect(result).toEqual({ models: ["gpt-4o", "gpt-4o-mini"], live: true })
    expect(seen).toEqual([{ baseUrl: "http://127.0.0.1:9/style", apiKey: "sk-style" }])
  })

  test("falls back to the known preset's defaults when the endpoint fails", async () => {
    const fetchModels = makeUseCase(
      async () => err({ kind: "upstream", detail: "connection refused" }),
      storedConfig({
        lyrics: setting({ presetId: "groq", baseUrl: "https://api.groq.com/openai/v1" }),
      }),
    )

    const result = await fetchModels("lyrics")

    expect(result.models).toContain("llama-3.3-70b-versatile")
    expect(result.live).toBe(false)
    expect(result.detail).toBe("connection refused")
  })

  test("matches a preset by id when the base URL is unknown", async () => {
    const fetchModels = makeUseCase(
      async () => err({ kind: "upstream", detail: "offline" }),
      storedConfig({
        style: setting({ presetId: "mistral", baseUrl: "http://127.0.0.1:9/custom" }),
      }),
    )

    const result = await fetchModels("style")

    expect(result.models).toContain("mistral-large-latest")
    expect(result.live).toBe(false)
  })

  test("reports a fallback detail when the endpoint lists no models", async () => {
    const fetchModels = makeUseCase(async () => ok([]))

    const result = await fetchModels("style")

    expect(result).toEqual({
      models: [],
      live: false,
      detail: "the endpoint listed no models",
    })
  })
})
