import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AiSlice } from "../ai/ai.models"
import { buildApp } from "../app"
import { openDatabase } from "../db/client"
import { songAudioKey, songTitleFromLyrics } from "./songs.media.keys"
import {
  makeListMediaFiles,
  makeMoveAudio,
  makeOpenAudioRange,
  makePutAudio,
  makeReadAudio,
  makeRemoveAudio,
  makeStatAudio,
} from "./songs.media.adapters"
import { assembleSongsSlice } from "./songs.assembly"
import { NewSong } from "./songs.models"
import { makeInsertSong, makeInsertSongAudio, makeMarkSongComplete } from "./songs.sqlite.adapters"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"
const lyrics = "amazing awesome song"

const unusedAi: AiSlice = {
  listPresets: () => [],
  getConfig: async () => {
    throw new Error("audio route tests never call the AI slice")
  },
  saveConfig: async () => {
    throw new Error("audio route tests never call the AI slice")
  },
  fetchModels: async () => {
    throw new Error("audio route tests never call the AI slice")
  },
  enhance: async () => {
    throw new Error("audio route tests never call the AI slice")
  },
  randomSong: async () => {
    throw new Error("audio route tests never call the AI slice")
  },
}

const withCompleteSong = async (
  fileKey: string,
  bytes: Uint8Array,
  run: (app: ReturnType<typeof buildApp>) => Promise<void>,
): Promise<void> => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-audio-route-test-"))
  const handle = openDatabase({ path: ":memory:" })
  try {
    const putAudio = makePutAudio(mediaDir)
    const songs = assembleSongsSlice({
      db: handle.db,
      audioPath: (key) => join(mediaDir, key),
      putAudio,
      statAudio: makeStatAudio(mediaDir),
      readAudio: makeReadAudio(mediaDir),
      openAudioRange: makeOpenAudioRange(mediaDir),
      moveAudio: makeMoveAudio(mediaDir),
      removeAudio: makeRemoveAudio(mediaDir),
      listMediaFiles: makeListMediaFiles(mediaDir),
      yue2: { kitRoot: "/kit", pythonBin: "/kit/python", scriptBin: "/kit/yue2", gpuBudget: 1 },
      sheetsage2: {
        pythonBin: "/kit/python",
        scriptPath: "/kit/transcribe.py",
        model: "/kit/model",
        baseModel: null,
        device: "cpu",
        offline: true,
        cwd: "/kit",
      },
      ffmpeg: { ffmpegBin: "ffmpeg" },
    })

    const newSong: NewSong = {
      id: songId,
      lyrics,
      style: "pop",
      seed: 1,
      cot: "full",
      referenceId: null,
      createdAt: "2026-09-17T04:00:00.000Z",
      updatedAt: "2026-09-17T04:00:00.000Z",
    }
    await makeInsertSong(handle.db)(newSong)
    await putAudio(fileKey, bytes)
    await makeInsertSongAudio(handle.db)({
      songId,
      byteLength: bytes.byteLength,
      contentType: "audio/mpeg",
    })
    await makeMarkSongComplete(handle.db)({
      songId,
      scoreAbc: null,
      durationSeconds: 1,
      truncated: { abc: false, semantic: false },
    })

    const app = buildApp({
      songs,
      referenceMaxBytes: 1024,
      ai: unusedAi,
      status: async () => ({
        version: "0.1.0",
        state: "online",
        ffmpeg: "ok",
        yue2: "ok",
        sheetsage2: "ok",
        queueDepth: 0,
        gpuBusy: false,
        startedAt: "2026-09-17T04:00:00.000Z",
      }),
    })

    await run(app)
  } finally {
    handle.close()
    await rm(mediaDir, { recursive: true, force: true })
  }
}

test("a range request serves the window from a multi-megabyte file on disk", async () => {
  const largeMp3 = Uint8Array.from({ length: 5 * 1024 * 1024 }, (_, index) => index % 251)
  const fileKey = songAudioKey(songId, songTitleFromLyrics(lyrics))

  await withCompleteSong(fileKey, largeMp3, async (app) => {
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

test("a bare id file still plays while the library catches up", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6])
  const fileKey = songAudioKey(songId, null)

  await withCompleteSong(fileKey, bytes, async (app) => {
    const response = await app.inject({ method: "GET", url: `/v1/songs/${songId}/audio` })

    expect(response.statusCode).toBe(200)
    expect(response.headers["content-length"]).toBe("6")
    expect(response.rawPayload).toEqual(Buffer.from(bytes))
  })
})
