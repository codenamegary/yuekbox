import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AiSlice } from "../ai/ai.models"
import { buildApp } from "../app"
import { openDatabase } from "../db/client"
import { songAudioKey } from "../media/audio.keys"
import { makeFsAudioStore } from "../media/audio.store"
import { assembleSongsSlice } from "./songs.assembly"
import { NewSong } from "./songs.models"
import { makeInsertSong, makeInsertSongAudio, makeMarkSongComplete } from "./songs.sqlite.adapters"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

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

test("a range request serves the window from a multi-megabyte file on disk", async () => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-audio-route-test-"))
  const handle = openDatabase({ path: ":memory:" })
  try {
    const audioStore = makeFsAudioStore(mediaDir)
    const songs = assembleSongsSlice({
      db: handle.db,
      audioStore,
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

    const largeMp3 = Uint8Array.from({ length: 5 * 1024 * 1024 }, (_, index) => index % 251)
    const newSong: NewSong = {
      id: songId,
      lyrics: "hello",
      style: "pop",
      seed: 1,
      cot: "full",
      referenceId: null,
      createdAt: "2026-09-17T04:00:00.000Z",
      updatedAt: "2026-09-17T04:00:00.000Z",
    }
    await makeInsertSong(handle.db)(newSong)
    await audioStore.put(songAudioKey(songId), largeMp3)
    await makeInsertSongAudio(handle.db)({
      songId,
      byteLength: largeMp3.byteLength,
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
  } finally {
    handle.close()
    await rm(mediaDir, { recursive: true, force: true })
  }
})
