import { describe, expect, test } from "bun:test"
import { err, ok } from "../shared/result"
import { StoredConfig, StoredSetting } from "./ai.models"
import { ChatCompletion } from "./ai.ports"
import { makeEnhance } from "./ai.enhance.usecase"

const words = (count: number): string =>
  Array.from({ length: count }, (_, index) => `word${index}`).join(" ")

const styleBrief = "electro swing, brass stabs, female alto, 122 bpm"
const lyricSheet = `[Verse]\n${words(200)}\n[Chorus]\n${words(100)}`

const setting = (model: string): StoredSetting => ({
  presetId: "custom",
  baseUrl: "http://127.0.0.1:9/v1",
  apiKey: null,
  model,
  effort: "medium",
})

const storedConfig = (overrides: Partial<StoredConfig> = {}): StoredConfig => ({
  enabled: true,
  style: setting("style-model"),
  lyrics: setting("lyrics-model"),
  visuals: setting("visuals-model"),
  ...overrides,
})

const makeUseCase = (chat: ChatCompletion, config: StoredConfig = storedConfig()) =>
  makeEnhance({ loadStoredConfig: async () => config, chat })

describe("makeEnhance", () => {
  test("retries an unusable reply and returns the next usable one", async () => {
    const calls: number[] = []
    const enhance = makeUseCase(async () => {
      calls.push(1)
      return calls.length === 1 ? ok("too short") : ok(lyricSheet)
    })

    const result = await enhance({ kind: "lyrics", style: "gospel", lyrics: "[Verse]\nold words" })

    expect(result).toEqual(ok(lyricSheet))
    expect(calls).toHaveLength(2)
  })

  test("retries an upstream failure and returns the next usable reply", async () => {
    const calls: number[] = []
    const enhance = makeUseCase(async () => {
      calls.push(1)
      return calls.length === 1
        ? err({ kind: "upstream", detail: "connection refused" })
        : ok(styleBrief)
    })

    const result = await enhance({ kind: "style", style: "techno", lyrics: "" })

    expect(result).toEqual(ok(styleBrief))
    expect(calls).toHaveLength(2)
  })

  test("gives up after five retries and reports an unusable result", async () => {
    const calls: number[] = []
    const enhance = makeUseCase(async () => {
      calls.push(1)
      return ok("still much too short")
    })

    const result = await enhance({ kind: "lyrics", style: "", lyrics: "[Verse]\nx" })

    expect(result).toEqual(
      err({
        kind: "unusable_result",
        detail: "the model's lyrics were missing section tags or outside 150 to 400 words",
      }),
    )
    expect(calls).toHaveLength(6)
  })

  test("never calls the model when the config is not ready", async () => {
    const calls: number[] = []
    const enhance = makeUseCase(
      async () => {
        calls.push(1)
        return ok(styleBrief)
      },
      storedConfig({ enabled: false }),
    )

    const result = await enhance({ kind: "style", style: "techno", lyrics: "" })

    expect(result).toEqual(
      err({ kind: "ai_disabled", detail: "AI is disabled. Enable it in settings first." }),
    )
    expect(calls).toHaveLength(0)
  })

  test("sends the style prompt through the style scope's model", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const enhance = makeUseCase(async (writer, _system, user) => {
      seen.push({ model: writer.model, user })
      return ok(styleBrief)
    })

    const result = await enhance({ kind: "style", style: "dream pop", lyrics: "" })

    expect(result).toEqual(ok(styleBrief))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.model).toBe("style-model")
    expect(seen[0]?.user).toContain("STYLE:")
  })
})
