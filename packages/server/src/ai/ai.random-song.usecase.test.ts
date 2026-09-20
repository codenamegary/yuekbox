import { describe, expect, test } from "bun:test"
import { CreateSongBody } from "contracts/http/songs"
import { err, ok } from "../shared/result"
import { songFixture } from "../songs/songs.fixtures"
import { CreateSong } from "../songs/songs.ports"
import { StoredConfig, StoredSetting } from "./ai.models"
import { ChatCompletion } from "./ai.ports"
import { makeRandomSong } from "./ai.random-song.usecase"

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
  ...overrides,
})

const chatFor =
  (seen: Array<{ model: string; user: string }>): ChatCompletion =>
  async (writer, _system, user) => {
    seen.push({ model: writer.model, user })
    return user.includes("Invent a brand new musical direction") ? ok(styleBrief) : ok(lyricSheet)
  }

const createSongFor =
  (calls: CreateSongBody[]): CreateSong =>
  async (body) => {
    calls.push(body)
    return ok(songFixture({ lyrics: body.lyrics, style: body.style }))
  }

const makeUseCase = (options: {
  chat: ChatCompletion
  createSong?: CreateSong
  wake?: () => void
  config?: StoredConfig
}) =>
  makeRandomSong({
    loadStoredConfig: async () => options.config ?? storedConfig(),
    chat: options.chat,
    createSong: options.createSong ?? createSongFor([]),
    wake: options.wake ?? (() => {}),
  })

describe("makeRandomSong", () => {
  test("calls the style scope first, then the lyrics scope with the style brief", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const randomSong = makeUseCase({ chat: chatFor(seen) })

    const result = await randomSong()

    expect(result.ok).toBe(true)
    expect(seen.map((call) => call.model)).toEqual(["style-model", "lyrics-model"])
    expect(seen[0]?.user).toContain("Invent a brand new musical direction")
    expect(seen[1]?.user).toContain(styleBrief)
  })

  test("creates the song from both replies and kicks the worker", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const bodies: CreateSongBody[] = []
    const kicks: number[] = []
    const randomSong = makeUseCase({
      chat: chatFor(seen),
      createSong: createSongFor(bodies),
      wake: () => {
        kicks.push(1)
      },
    })

    const result = await randomSong()

    expect(result.ok && result.value.style).toBe(styleBrief)
    expect(result.ok && result.value.lyrics).toBe(lyricSheet)
    expect(bodies).toEqual([{ style: styleBrief, lyrics: lyricSheet }])
    expect(kicks).toHaveLength(1)
  })

  test("reports an upstream failure when the generated song is rejected", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const randomSong = makeUseCase({
      chat: chatFor(seen),
      createSong: async () =>
        err({ kind: "validation_error", pointer: "/lyrics", code: "invalid" }),
    })

    const result = await randomSong()

    expect(result).toEqual(
      err({ kind: "upstream_failed", detail: "generated song failed validation" }),
    )
  })

  test("refuses before any call when the style scope has no model", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const randomSong = makeUseCase({
      chat: chatFor(seen),
      config: storedConfig({ style: setting("") }),
    })

    const result = await randomSong()

    expect(result).toEqual(
      err({ kind: "not_configured", detail: "Pick a model in AI settings first." }),
    )
    expect(seen).toHaveLength(0)
  })

  test("refuses before any call when the lyrics scope has no model", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const randomSong = makeUseCase({
      chat: chatFor(seen),
      config: storedConfig({ lyrics: setting("") }),
    })

    const result = await randomSong()

    expect(result).toEqual(
      err({ kind: "not_configured", detail: "Pick a model in AI settings first." }),
    )
    expect(seen).toHaveLength(0)
  })
})
