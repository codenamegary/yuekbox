import { describe, expect, test } from "bun:test"
import { PROBLEM_TYPES } from "contracts/http/error"
import { SongSchema } from "contracts/http/songs"
import { Status } from "contracts/http/status"
import { buildApp, AppDeps } from "../app"
import { err, ok } from "../shared/result"
import { SongsSlice } from "../songs/songs.assembly"
import { Song } from "../songs/songs.models"
import { openDatabase } from "../db/client"
import { makeAiConfigStore } from "./ai.config.store"
import { AiSlice } from "./ai.models"
import { assembleAiSlice } from "./ai.slice"
import { chatCompletion, listModels } from "./ai.openai"

const makeApp = (deps: Omit<AppDeps, "referenceMaxBytes">) =>
  buildApp({ referenceMaxBytes: 1024, ...deps })

const statusFixture: Status = Object.freeze({
  version: "0.1.0",
  state: "online",
  ffmpeg: "ok",
  yue2: "ok",
  sheetsage2: "ok",
  queueDepth: 0,
  gpuBusy: false,
  startedAt: "2026-09-19T00:00:00.000Z",
})

/** A real OpenAI-compatible server on an ephemeral port — no mocks. */
const startFakeOpenAI = () => {
  const server = Bun.serve({
    port: 0,
    routes: {
      "/v1/models": () => Response.json({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
      "/v1/chat/completions": async (request) => {
        const auth = request.headers.get("authorization")
        if (auth !== "Bearer sk-test") {
          return Response.json(
            { error: { message: "Incorrect API key provided" } },
            { status: 401 },
          )
        }
        const body = (await request.json()) as {
          model?: string
          messages?: ReadonlyArray<{ role: string; content: string }>
          reasoning_effort?: string
        }
        if (body.model === "explode") {
          return Response.json(
            { error: { message: "the model refused on artistic grounds" } },
            { status: 500 },
          )
        }
        const user = body.messages?.find((message) => message.role === "user")?.content ?? ""
        const reply =
          user.includes("STYLE:") && user.includes("LYRICS:")
            ? "STYLE:\nelectro swing\n\nLYRICS:\n[Chorus]\ndance, robot"
            : user.includes("STYLE:")
              ? "lush dream pop, tape hiss"
              : "[Verse]\nneon rain"
        return Response.json({
          choices: [{ message: { role: "assistant", content: reply } }],
        })
      },
    },
  })
  return { baseUrl: `http://127.0.0.1:${server.port}/v1`, stop: () => server.stop(true) }
}

const songsSlice = (kicks: number[] = []): SongsSlice => ({
  createSong: async (body) =>
    ok({
      id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
      status: "queued",
      stage: null,
      stageCompleted: null,
      stageTotal: null,
      lyrics: body.lyrics,
      style: body.style,
      seed: 1,
      cot: "full",
      reference: null,
      scoreAbc: null,
      durationSeconds: null,
      truncatedAbc: null,
      truncatedSemantic: null,
      errorDetail: null,
      createdAt: "2026-09-19T00:00:00.000Z",
      updatedAt: "2026-09-19T00:00:00.000Z",
      completedAt: null,
    } satisfies Song),
  listSongs: async () =>
    ok({ items: [], limit: 20, nextCursor: null, previousCursor: null, count: 0 }),
  getSong: async () => err({ kind: "not_found" }),
  deleteSong: async () => err({ kind: "not_found" }),
  getSongAudio: async () => err({ kind: "not_found" }),
  createReference: async () => err({ kind: "validation_error", pointer: "/", code: "unused" }),
  recoverInterruptedSongs: async () => 0,
  purgeStaleReferences: async () => 0,
  queueDepth: async () => 0,
  worker: {
    kick: () => kicks.push(1),
    drain: async () => {},
    isBusy: () => false,
  },
})

const buildAi = (): AiSlice =>
  assembleAiSlice({
    configStore: makeAiConfigStore(openDatabase({ path: ":memory:" }).db),
    chat: chatCompletion,
    listModels,
    songs: songsSlice(),
  })

describe("ai routes", () => {
  test("presets lists the known providers", async () => {
    const fake = startFakeOpenAI()
    try {
      const app = makeApp({
        songs: songsSlice(),
        ai: buildAi(),
        status: async () => statusFixture,
      })
      const response = await app.inject({ method: "GET", url: "/v1/ai/presets" })
      expect(response.statusCode).toBe(200)
      const ids = response.json().presets.map((preset: { id: string }) => preset.id)
      expect(ids).toContain("openai")
      expect(ids).toContain("ollama")
      expect(ids).toContain("custom")
    } finally {
      void fake.stop()
    }
  })

  test("config defaults to AI disabled with no key hints", async () => {
    const fake = startFakeOpenAI()
    try {
      const app = makeApp({
        songs: songsSlice(),
        ai: buildAi(),
        status: async () => statusFixture,
      })
      const response = await app.inject({ method: "GET", url: "/v1/ai/config" })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.enabled).toBe(false)
      expect(body.style.keyHint).toBeNull()
    } finally {
      void fake.stop()
    }
  })

  test("config PUT rejects a bogus base URL", async () => {
    const fake = startFakeOpenAI()
    try {
      const app = makeApp({
        songs: songsSlice(),
        ai: buildAi(),
        status: async () => statusFixture,
      })
      const response = await app.inject({
        method: "PUT",
        url: "/v1/ai/config",
        payload: { style: { baseUrl: "not-a-url" } },
      })
      expect(response.statusCode).toBe(400)
      expect(response.json().type).toBe(PROBLEM_TYPES.validationError)
    } finally {
      void fake.stop()
    }
  })

  test("models endpoint falls back to preset defaults when the endpoint is dead", async () => {
    const fake = startFakeOpenAI()
    const deadUrl = fake.baseUrl
    void fake.stop()
    const ai = buildAi()
    await ai.saveConfig({ style: { baseUrl: deadUrl } })
    const app = makeApp({
      songs: songsSlice(),
      ai,
      status: async () => statusFixture,
    })
    const response = await app.inject({ method: "GET", url: "/v1/ai/models?scope=style" })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.live).toBe(false)
    expect(body.detail).toBeTruthy()
  })

  test("enhance is refused while AI is disabled", async () => {
    const fake = startFakeOpenAI()
    try {
      const app = makeApp({
        songs: songsSlice(),
        ai: buildAi(),
        status: async () => statusFixture,
      })
      const response = await app.inject({
        method: "POST",
        url: "/v1/ai/enhance",
        payload: { kind: "style", style: "dream pop" },
      })
      expect(response.statusCode).toBe(409)
    } finally {
      void fake.stop()
    }
  })

  test("enhance runs the full round trip once configured", async () => {
    const fake = startFakeOpenAI()
    try {
      const ai = buildAi()
      await ai.saveConfig({
        enabled: true,
        style: { baseUrl: fake.baseUrl, apiKey: "sk-test", model: "gpt-4o" },
      })
      const app = makeApp({
        songs: songsSlice(),
        ai,
        status: async () => statusFixture,
      })
      const response = await app.inject({
        method: "POST",
        url: "/v1/ai/enhance",
        payload: { kind: "style", style: "dream pop" },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().text).toBe("lush dream pop, tape hiss")
    } finally {
      void fake.stop()
    }
  })

  test("enhance surfaces upstream failures with their detail", async () => {
    const fake = startFakeOpenAI()
    try {
      const ai = buildAi()
      await ai.saveConfig({
        enabled: true,
        style: { baseUrl: fake.baseUrl, apiKey: "sk-test", model: "explode" },
      })
      const app = makeApp({
        songs: songsSlice(),
        ai,
        status: async () => statusFixture,
      })
      const response = await app.inject({
        method: "POST",
        url: "/v1/ai/enhance",
        payload: { kind: "style", style: "dream pop" },
      })
      expect(response.statusCode).toBe(502)
      expect(response.json().detail).toContain("artistic grounds")
    } finally {
      void fake.stop()
    }
  })

  test("models endpoint lists live models from the configured endpoint", async () => {
    const fake = startFakeOpenAI()
    try {
      const ai = buildAi()
      await ai.saveConfig({
        enabled: true,
        style: { baseUrl: fake.baseUrl, apiKey: "sk-test", model: "gpt-4o" },
      })
      const app = makeApp({
        songs: songsSlice(),
        ai,
        status: async () => statusFixture,
      })
      const response = await app.inject({ method: "GET", url: "/v1/ai/models?scope=style" })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.live).toBe(true)
      expect(body.models).toEqual(["gpt-4o", "gpt-4o-mini"])
    } finally {
      void fake.stop()
    }
  })

  test("random song creates and queues a song", async () => {
    const fake = startFakeOpenAI()
    try {
      const kicks: number[] = []
      const songs = songsSlice(kicks)
      const ai = assembleAiSlice({
        configStore: makeAiConfigStore(openDatabase({ path: ":memory:" }).db),
        chat: chatCompletion,
        listModels,
        songs,
      })
      await ai.saveConfig({
        enabled: true,
        lyrics: { baseUrl: fake.baseUrl, apiKey: "sk-test", model: "gpt-4o" },
      })
      const app = makeApp({ songs, ai, status: async () => statusFixture })
      const response = await app.inject({ method: "POST", url: "/v1/ai/songs/random" })
      expect(response.statusCode).toBe(201)
      expect(SongSchema.parse(response.json()).style).toBe("electro swing")
      expect(kicks).toHaveLength(1)
    } finally {
      void fake.stop()
    }
  })

  test("random song demands a model before spending a call", async () => {
    const fake = startFakeOpenAI()
    try {
      const app = makeApp({
        songs: songsSlice(),
        ai: buildAi(),
        status: async () => statusFixture,
      })
      await app.inject({
        method: "PUT",
        url: "/v1/ai/config",
        payload: { enabled: true, lyrics: { baseUrl: fake.baseUrl, apiKey: "sk-test" } },
      })
      const response = await app.inject({ method: "POST", url: "/v1/ai/songs/random" })
      expect(response.statusCode).toBe(409)
      expect(response.json().detail).toContain("Pick a model")
    } finally {
      void fake.stop()
    }
  })
})
