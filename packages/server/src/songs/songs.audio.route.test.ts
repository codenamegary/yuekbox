import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Status } from "contracts/http/status"
import { PROBLEM_TYPES } from "contracts/http/error"
import { unusedAiFixture } from "../ai/ai.fixtures"
import { buildApp } from "../app"
import { unusedConfigFixture } from "../config/config.fixtures"
import { openDatabase } from "../db/client"
import { assembleMediaSlice } from "../media/media.assembly"
import { unusedReadinessFixture } from "../readiness/readiness.fixtures"
import { ok } from "../shared/result"
import { assembleSongsSlice, SongsSlice } from "./songs.assembly"
import { makeSongsSliceFixture, songFolderKey, writeMediaFile } from "./songs.fixtures"
import { generatedAudioKey } from "./songs.files"
import { makeInsertSong, makeMarkSongComplete } from "./songs.sqlite.adapters"
import { unusedVisualizationsFixture } from "../visualizations/visualizations.fixtures"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
const lyrics = "hello"

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

const makeApp = (songs: SongsSlice) =>
  buildApp({
    songs,
    wake: () => {},
    referenceMaxBytes: 1024,
    ai: unusedAiFixture(),
    visualizations: unusedVisualizationsFixture(),
    config: unusedConfigFixture(),
    readiness: unusedReadinessFixture(),
    status: async () => statusFixture,
  })

const withCompleteSongRow = async (
  run: (context: Readonly<{ app: ReturnType<typeof buildApp>; mediaDir: string }>) => Promise<void>,
): Promise<void> => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-audio-route-test-"))
  const handle = openDatabase({ path: ":memory:" })
  try {
    const songs = assembleSongsSlice({ db: handle.db, media: assembleMediaSlice(mediaDir) })
    await makeInsertSong(handle.db)({
      id: songId,
      lyrics,
      title: lyrics,
      style: "pop",
      seed: 1,
      cot: "full",
      createdAt: "2026-09-17T04:00:00.000Z",
      updatedAt: "2026-09-17T04:00:00.000Z",
    })
    await makeMarkSongComplete(handle.db)({
      songId,
      durationSeconds: 1,
      truncated: { abc: false, semantic: false },
    })

    await run({ app: makeApp(songs), mediaDir })
  } finally {
    handle.close()
    await rm(mediaDir, { recursive: true, force: true })
  }
}

test("a range request serves the window from the file in the song folder", async () => {
  const largeMp3 = Uint8Array.from({ length: 5 * 1024 * 1024 }, (_, index) => index % 251)

  await withCompleteSongRow(async ({ app, mediaDir }) => {
    await writeMediaFile(
      mediaDir,
      generatedAudioKey(songFolderKey(lyrics, songId), songId),
      largeMp3,
    )

    const start = 1_000_000
    const end = 1_000_099
    const response = await app.inject({
      method: "GET",
      url: `/v1/songs/${songId}/audio`,
      headers: { range: `bytes=${start}-${end}` },
    })

    expect(response.statusCode).toBe(206)
    expect(response.headers["content-range"]).toBe(`bytes ${start}-${end}/${largeMp3.byteLength}`)
    expect(response.headers["content-length"]).toBe("100")
    expect(response.rawPayload).toEqual(Buffer.from(largeMp3.subarray(start, end + 1)))
  })
})

test("a complete song whose audio file is gone is not-found", async () => {
  await withCompleteSongRow(async ({ app }) => {
    const response = await app.inject({ method: "GET", url: `/v1/songs/${songId}/audio` })

    expect(response.statusCode).toBe(404)
    expect(response.json().type).toBe(PROBLEM_TYPES.notFound)
  })
})

test("audio before completion is a conflict problem", async () => {
  const app = makeApp(
    makeSongsSliceFixture({
      getSongAudio: async () => ({ ok: false, error: { kind: "not_complete" } }),
    }),
  )

  const response = await app.inject({ method: "GET", url: `/v1/songs/${songId}/audio` })

  expect(response.statusCode).toBe(409)
  expect(response.json().type).toBe(PROBLEM_TYPES.conflict)
})

test("an unsatisfiable range is a 416 and reads nothing", async () => {
  const reads: number[] = []
  const app = makeApp(
    makeSongsSliceFixture({
      getSongAudio: async () =>
        ok({
          contentType: "audio/mpeg",
          byteLength: 3,
          read: async () => {
            reads.push(1)
            return new Uint8Array([1, 2, 3])
          },
        }),
    }),
  )

  const response = await app.inject({
    method: "GET",
    url: `/v1/songs/${songId}/audio`,
    headers: { range: "bytes=5-9" },
  })

  expect(response.statusCode).toBe(416)
  expect(response.headers["content-range"]).toBe("bytes */3")
  expect(reads).toEqual([])
})
