import { describe, expect, test } from "bun:test"
import { PROBLEM_TYPES } from "contracts/http/error"
import { Status } from "contracts/http/status"
import { SongVisualizationSchema } from "contracts/http/visualizations"
import { unusedAiFixture } from "../ai/ai.fixtures"
import { AiNotReadyError, VisualizationAuthorError } from "../ai/ai.models"
import { buildApp } from "../app"
import { err, ok, Result } from "../shared/result"
import { makeSongsSliceFixture, songFixture } from "../songs/songs.fixtures"
import { Song } from "../songs/songs.models"
import { assembleVisualizationsSlice } from "./visualizations.assembly"

const song = songFixture()
const code =
  "(host) => ({ resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} })"
const newCode =
  "(host) => ({ resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {}, hue: 1 })"

type AuthorReply = Result<Readonly<{ code: string }>, VisualizationAuthorError>

const statusFixture: Status = Object.freeze({
  version: "0.1.0",
  state: "online",
  ffmpeg: "ok",
  yue2: "ok",
  sheetsage2: "ok",
  queueDepth: 0,
  gpuBusy: false,
  startedAt: "2026-09-17T04:00:00.000Z",
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

const makeHarness = () => {
  const songsById = new Map<string, Song>([[song.id, song]])
  const files = new Map<string, string>()
  const replies: Array<(reply: AuthorReply) => void> = []
  let allowed: Result<null, AiNotReadyError> = ok(null)

  const visualizations = assembleVisualizationsSlice({
    findSongById: async (songId) => songsById.get(songId) ?? null,
    readVisualizationFile: async (songId) => files.get(songId) ?? null,
    writeVisualizationFile: async (songId, fileCode) => {
      files.set(songId, fileCode)
      return fileCode.length
    },
    canAuthorVisualizations: async () => allowed,
    authorVisualization: () => {
      const run = deferred<AuthorReply>()
      replies.push(run.resolve)
      return run.promise
    },
  })

  const app = buildApp({
    songs: makeSongsSliceFixture(),
    wake: () => {},
    referenceMaxBytes: 1024,
    ai: unusedAiFixture(),
    visualizations,
    status: async () => statusFixture,
  })

  return {
    app,
    visualizations,
    files,
    allow: (value: Result<null, AiNotReadyError>) => {
      allowed = value
    },
    resolveAuthor: (reply: AuthorReply) => {
      replies.at(-1)?.(reply)
    },
    runCount: () => replies.length,
  }
}

const getVisualization = async (harness: ReturnType<typeof makeHarness>) => {
  const response = await harness.app.inject({
    method: "GET",
    url: `/v1/songs/${song.id}/visualization`,
  })
  return response
}

describe("visualization routes", () => {
  test("GET on an unknown Song is 404", async () => {
    const harness = makeHarness()
    const response = await harness.app.inject({
      method: "GET",
      url: "/v1/songs/01J8K3R4P9ABCDEFGHJKMNPQRT/visualization",
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().type).toBe(PROBLEM_TYPES.notFound)
  })

  test("GET without a file and without state is 404", async () => {
    const harness = makeHarness()
    const response = await getVisualization(harness)

    expect(response.statusCode).toBe(404)
  })

  test("POST on an unknown Song is 404", async () => {
    const harness = makeHarness()
    const response = await harness.app.inject({
      method: "POST",
      url: "/v1/songs/01J8K3R4P9ABCDEFGHJKMNPQRT/visualization",
    })

    expect(response.statusCode).toBe(404)
  })

  test("POST is refused with the writer's detail when AI is off", async () => {
    const harness = makeHarness()
    harness.allow(
      err({ kind: "ai_disabled", detail: "AI is disabled. Enable it in settings first." }),
    )

    const response = await harness.app.inject({
      method: "POST",
      url: `/v1/songs/${song.id}/visualization`,
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().type).toBe(PROBLEM_TYPES.conflict)
    expect(response.json().detail).toBe("AI is disabled. Enable it in settings first.")
    expect(harness.runCount()).toBe(0)
  })

  test("POST kicks a run, GET polls pending, then the code lands ready", async () => {
    const harness = makeHarness()

    const posted = await harness.app.inject({
      method: "POST",
      url: `/v1/songs/${song.id}/visualization`,
    })
    expect(posted.statusCode).toBe(202)
    expect(posted.body).toBe("")

    const pending = SongVisualizationSchema.parse((await getVisualization(harness)).json())
    expect(pending).toEqual({ status: "pending" })

    harness.resolveAuthor(ok({ code }))
    await harness.visualizations.drain()

    const ready = SongVisualizationSchema.parse((await getVisualization(harness)).json())
    expect(ready.status).toBe("ready")
    expect(ready.code).toBe(code)
    expect(ready.checksum).toBeTruthy()
    expect(harness.files.get(song.id)).toBe(code)
  })

  test("a second POST while a run is in flight starts nothing new", async () => {
    const harness = makeHarness()

    await harness.app.inject({ method: "POST", url: `/v1/songs/${song.id}/visualization` })
    const second = await harness.app.inject({
      method: "POST",
      url: `/v1/songs/${song.id}/visualization`,
    })

    expect(second.statusCode).toBe(202)
    expect(harness.runCount()).toBe(1)

    harness.resolveAuthor(ok({ code }))
    await harness.visualizations.drain()
  })

  test("a reroll keeps the old code on screen until the new one lands", async () => {
    const harness = makeHarness()
    harness.files.set(song.id, code)

    const before = SongVisualizationSchema.parse((await getVisualization(harness)).json())
    expect(before.status).toBe("ready")

    await harness.app.inject({ method: "POST", url: `/v1/songs/${song.id}/visualization` })

    const during = SongVisualizationSchema.parse((await getVisualization(harness)).json())
    expect(during.status).toBe("rerolling")
    expect(during.code).toBe(code)
    expect(during.checksum).toBe(before.checksum)

    harness.resolveAuthor(ok({ code: newCode }))
    await harness.visualizations.drain()

    const after = SongVisualizationSchema.parse((await getVisualization(harness)).json())
    expect(after.status).toBe("ready")
    expect(after.code).toBe(newCode)
    expect(after.checksum).not.toBe(before.checksum)
  })

  test("an authoring failure is a badge, and a reroll clears it", async () => {
    const harness = makeHarness()

    await harness.app.inject({ method: "POST", url: `/v1/songs/${song.id}/visualization` })
    harness.resolveAuthor(err({ kind: "upstream_failed", detail: "503 down" }))
    await harness.visualizations.drain()

    const failed = SongVisualizationSchema.parse((await getVisualization(harness)).json())
    expect(failed).toEqual({ status: "failed", errorDetail: "503 down" })

    await harness.app.inject({ method: "POST", url: `/v1/songs/${song.id}/visualization` })
    const pending = SongVisualizationSchema.parse((await getVisualization(harness)).json())
    expect(pending).toEqual({ status: "pending" })

    harness.resolveAuthor(ok({ code }))
    await harness.visualizations.drain()

    const ready = SongVisualizationSchema.parse((await getVisualization(harness)).json())
    expect(ready.status).toBe("ready")
  })

  test("a failed reroll leaves the old visual playing and reports no error", async () => {
    const harness = makeHarness()
    harness.files.set(song.id, code)

    await harness.app.inject({ method: "POST", url: `/v1/songs/${song.id}/visualization` })
    harness.resolveAuthor(
      err({ kind: "unusable_result", detail: "the model replied with nothing" }),
    )
    await harness.visualizations.drain()

    const after = SongVisualizationSchema.parse((await getVisualization(harness)).json())
    expect(after.status).toBe("ready")
    expect(after.code).toBe(code)
  })

  test("a malformed song id is a 404, not a crash", async () => {
    const harness = makeHarness()
    const response = await harness.app.inject({
      method: "GET",
      url: "/v1/songs/not-a-ulid/visualization",
    })

    expect(response.statusCode).toBe(404)
  })
})
