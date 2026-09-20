import { describe, expect, test } from "bun:test"
import { CreateSongBody } from "contracts/http/songs"
import { openDatabase } from "../db/client"
import { err, ok, Result } from "../shared/result"
import { songFixture } from "../songs/songs.fixtures"
import { makeAiConfigStore } from "./ai.config.sqlite.adapters"
import { AiConfigStore, WriterSetting } from "./ai.models"
import { assembleAiSlice } from "./ai.slice"

const words = (count: number): string =>
  Array.from({ length: count }, (_, index) => `word${index}`).join(" ")

const styleBrief = "electro swing, brass stabs, female alto, 122 bpm"
const lyricSheet = `[Verse]\n${words(200)}\n[Chorus]\n${words(100)}`

const setting = (model: string) => ({
  presetId: "custom",
  baseUrl: "http://127.0.0.1:9/v1",
  model,
})

const makeStore = (): AiConfigStore => makeAiConfigStore(openDatabase({ path: ":memory:" }).db)

const songsDeps = (wakes: number[] = []) => ({
  createSong: async (body: CreateSongBody) =>
    ok(songFixture({ lyrics: body.lyrics, style: body.style })),
  wake: () => {
    wakes.push(1)
  },
})

describe("enhance retries and validation", () => {
  test("retries an unusable reply and returns the next usable one", async () => {
    const calls: number[] = []
    const store = makeStore()
    await store.save({ enabled: true, lyrics: setting("lyrics-model") })
    const ai = assembleAiSlice({
      configStore: store,
      chat: async () => {
        calls.push(1)
        return calls.length === 1 ? ok("too short") : ok(lyricSheet)
      },
      listModels: async () => ok([]),
      ...songsDeps(),
    })

    const result = await ai.enhance({
      kind: "lyrics",
      style: "gospel",
      lyrics: "[Verse]\nold words",
    })

    expect(result).toEqual(ok(lyricSheet))
    expect(calls).toHaveLength(2)
  })

  test("retries an upstream failure and returns the next usable reply", async () => {
    const calls: number[] = []
    const store = makeStore()
    await store.save({ enabled: true, style: setting("style-model") })
    const ai = assembleAiSlice({
      configStore: store,
      chat: async () => {
        calls.push(1)
        return calls.length === 1
          ? err({ kind: "upstream", detail: "connection refused" })
          : ok(styleBrief)
      },
      listModels: async () => ok([]),
      ...songsDeps(),
    })

    const result = await ai.enhance({ kind: "style", style: "techno", lyrics: "" })

    expect(result).toEqual(ok(styleBrief))
    expect(calls).toHaveLength(2)
  })

  test("gives up after five retries and reports an unusable result", async () => {
    const calls: number[] = []
    const store = makeStore()
    await store.save({ enabled: true, lyrics: setting("lyrics-model") })
    const ai = assembleAiSlice({
      configStore: store,
      chat: async () => {
        calls.push(1)
        return ok("still much too short")
      },
      listModels: async () => ok([]),
      ...songsDeps(),
    })

    const result = await ai.enhance({ kind: "lyrics", style: "", lyrics: "[Verse]\nx" })

    expect(result).toEqual(
      err({
        kind: "unusable_result",
        detail: "the model's lyrics were missing section tags or outside 150 to 400 words",
      }),
    )
    expect(calls).toHaveLength(6)
  })

  test("never retries config errors", async () => {
    const calls: number[] = []
    const store = makeStore()
    const ai = assembleAiSlice({
      configStore: store,
      chat: async () => {
        calls.push(1)
        return ok(styleBrief)
      },
      listModels: async () => ok([]),
      ...songsDeps(),
    })

    const result = await ai.enhance({ kind: "style", style: "techno", lyrics: "" })

    expect(result).toEqual(
      err({ kind: "ai_disabled", detail: "AI is disabled. Enable it in settings first." }),
    )
    expect(calls).toHaveLength(0)
  })
})

describe("random song flow", () => {
  const chatFor =
    (seen: Array<{ model: string; user: string }>) =>
    async (
      writer: WriterSetting,
      _system: string,
      user: string,
    ): Promise<Result<string, { kind: "upstream"; detail: string }>> => {
      seen.push({ model: writer.model, user })
      return user.includes("Invent a brand new musical direction") ? ok(styleBrief) : ok(lyricSheet)
    }

  test("calls the style scope first, then the lyrics scope with the style brief", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const store = makeStore()
    await store.save({
      enabled: true,
      style: setting("style-model"),
      lyrics: setting("lyrics-model"),
    })
    const ai = assembleAiSlice({
      configStore: store,
      chat: chatFor(seen),
      listModels: async () => ok([]),
      ...songsDeps(),
    })

    const result = await ai.randomSong()

    expect(result.ok).toBe(true)
    expect(seen.map((call) => call.model)).toEqual(["style-model", "lyrics-model"])
    expect(seen[0]?.user).toContain("Invent a brand new musical direction")
    expect(seen[1]?.user).toContain(styleBrief)
  })

  test("creates the song from both replies and kicks the worker", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const kicks: number[] = []
    const store = makeStore()
    await store.save({
      enabled: true,
      style: setting("style-model"),
      lyrics: setting("lyrics-model"),
    })
    const ai = assembleAiSlice({
      configStore: store,
      chat: chatFor(seen),
      listModels: async () => ok([]),
      ...songsDeps(kicks),
    })

    const result = await ai.randomSong()

    expect(result.ok && result.value.style).toBe(styleBrief)
    expect(result.ok && result.value.lyrics).toBe(lyricSheet)
    expect(kicks).toHaveLength(1)
  })

  test("refuses before any call when the style scope has no model", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const store = makeStore()
    await store.save({ enabled: true, lyrics: setting("lyrics-model") })
    const ai = assembleAiSlice({
      configStore: store,
      chat: chatFor(seen),
      listModels: async () => ok([]),
      ...songsDeps(),
    })

    const result = await ai.randomSong()

    expect(result).toEqual(
      err({ kind: "not_configured", detail: "Pick a model in AI settings first." }),
    )
    expect(seen).toHaveLength(0)
  })

  test("refuses before any call when the lyrics scope has no model", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const store = makeStore()
    await store.save({ enabled: true, style: setting("style-model") })
    const ai = assembleAiSlice({
      configStore: store,
      chat: chatFor(seen),
      listModels: async () => ok([]),
      ...songsDeps(),
    })

    const result = await ai.randomSong()

    expect(result).toEqual(
      err({ kind: "not_configured", detail: "Pick a model in AI settings first." }),
    )
    expect(seen).toHaveLength(0)
  })
})
