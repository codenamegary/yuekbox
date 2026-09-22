import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ReferenceSchema } from "contracts/http/references"
import { SongSchema } from "contracts/http/songs"
import { SongVisualizationSchema } from "contracts/http/visualizations"
import { composeServer } from "./compose"
import { openDatabase } from "./db/client"
import { ok } from "./shared/result"
import {
  calibrationFileName,
  generatedAudioFileName,
  referenceScoreFileName,
  scoreFileName,
  visualizationFileName,
} from "./songs/songs.files"

const mp3Bytes = Uint8Array.from({ length: 2 * 1024 * 1024 }, (_, index) => index % 251)

test("the wired app drives upload, create, complete, stream, and delete", async () => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-compose-test-"))
  const handle = openDatabase({ path: ":memory:" })
  try {
    const transcribedPaths: string[] = []
    const alignedPaths: string[] = []
    const generatedCalls: Array<Readonly<{ cot: string; abc: string | null }>> = []

    const { app, generation } = composeServer({
      db: handle.db,
      mediaDir,
      runYue2Generate: async (input) => {
        generatedCalls.push({ cot: input.cot, abc: input.abc })
        return ok({
          flacPath: "/tmp/yuekbox-compose-test/audio.flac",
          scoreAbc: "X:1\nK:C\nC D E F|",
          durationSeconds: 152.5,
          truncated: { abc: false, semantic: false },
          stages: ["plan", "semantic", "synthesize", "decode"],
        })
      },
      runTranscribe: async (input) => {
        transcribedPaths.push(input.audioPath)
        return ok({ scoreAbc: "X:1\nK:C\nC D E|" })
      },
      runLyricAlign: async (input) => {
        alignedPaths.push(input.audioPath)
        return ok({
          calibration: { cues: [{ text: "hello world", startSeconds: 12.3, endSeconds: 16.8 }] },
        })
      },
      encodeFlacToMp3: async () => ok(mp3Bytes),
      referenceMaxBytes: 1024 * 1024,
      service: { version: "0.1.0", state: () => "online", startedAt: "2026-09-17T04:00:00.000Z" },
      dependencies: { ffmpeg: "ok", yue2: "ok", sheetsage2: "ok" },
      now: () => "2026-09-17T04:00:00.000Z",
    })

    const upload = await app.inject({
      method: "POST",
      url: "/v1/references?filename=Demo Song.mp3",
      headers: { "content-type": "audio/mpeg" },
      payload: Buffer.from([1, 2, 3, 4]),
    })
    expect(upload.statusCode).toBe(201)
    const reference = ReferenceSchema.parse(upload.json())
    expect(reference.filename).toBe("Demo Song.mp3")
    const uploadPath = join(mediaDir, "temp", `Demo Song_${reference.id}.mp3`)
    expect(existsSync(uploadPath)).toBe(true)

    const created = await app.inject({
      method: "POST",
      url: "/v1/songs",
      payload: { lyrics: "hello world", style: "warm piano pop", referenceId: reference.id },
    })
    expect(created.statusCode).toBe(201)
    const queued = SongSchema.parse(created.json())
    expect(queued.status).toBe("queued")
    expect(queued.reference).toEqual({ id: reference.id, filename: "Demo Song.mp3" })

    const folderKey = `hello-world_${queued.id}`
    const referencePath = join(mediaDir, folderKey, "references", `Demo Song_${reference.id}.mp3`)
    expect(existsSync(referencePath)).toBe(true)
    expect(existsSync(uploadPath)).toBe(false)

    const noVisualization = await app.inject({
      method: "GET",
      url: `/v1/songs/${queued.id}/visualization`,
    })
    expect(noVisualization.statusCode).toBe(404)
    expect(existsSync(join(mediaDir, folderKey, visualizationFileName))).toBe(false)

    generation.worker.wake()
    await generation.worker.drain()

    expect(existsSync(join(mediaDir, folderKey, generatedAudioFileName(queued.id)))).toBe(true)
    expect(existsSync(join(mediaDir, folderKey, scoreFileName))).toBe(true)
    expect(existsSync(join(mediaDir, folderKey, referenceScoreFileName))).toBe(true)
    expect(existsSync(join(mediaDir, folderKey, calibrationFileName))).toBe(true)
    expect(transcribedPaths).toEqual([referencePath])
    expect(alignedPaths).toEqual(["/tmp/yuekbox-compose-test/audio.flac"])
    expect(generatedCalls).toEqual([{ cot: "melody", abc: "X:1\nK:C\nC D E|" }])

    const fetched = await app.inject({ method: "GET", url: `/v1/songs/${queued.id}` })
    expect(fetched.statusCode).toBe(200)
    const complete = SongSchema.parse(fetched.json())
    expect(complete.status).toBe("complete")
    expect(complete.scoreAbc).toBe("X:1\nK:C\nC D E F|")
    expect(complete.calibration).toEqual({
      cues: [{ text: "hello world", startSeconds: 12.3, endSeconds: 16.8 }],
    })
    expect(complete.reference).toEqual({ id: reference.id, filename: "Demo Song.mp3" })
    expect(complete.durationSeconds).toBe(152.5)

    const start = 1_000_000
    const end = 1_000_099
    const ranged = await app.inject({
      method: "GET",
      url: `/v1/songs/${queued.id}/audio`,
      headers: { range: `bytes=${start}-${end}` },
    })
    expect(ranged.statusCode).toBe(206)
    expect(ranged.headers["content-range"]).toBe(`bytes ${start}-${end}/${mp3Bytes.byteLength}`)
    expect(ranged.rawPayload).toEqual(Buffer.from(mp3Bytes.subarray(start, end + 1)))

    const full = await app.inject({ method: "GET", url: `/v1/songs/${queued.id}/audio` })
    expect(full.statusCode).toBe(200)
    expect(full.headers["content-length"]).toBe(String(mp3Bytes.byteLength))

    const deleted = await app.inject({ method: "DELETE", url: `/v1/songs/${queued.id}` })
    expect(deleted.statusCode).toBe(204)
    expect(existsSync(join(mediaDir, folderKey))).toBe(false)
    expect(await readdir(mediaDir)).toEqual(["temp"])
    expect(await readdir(join(mediaDir, "temp"))).toEqual([])

    const gone = await app.inject({ method: "GET", url: `/v1/songs/${queued.id}/audio` })
    expect(gone.statusCode).toBe(404)
  } finally {
    handle.close()
    await rm(mediaDir, { recursive: true, force: true })
  }
})

const visualizationCode =
  "(host) => ({ resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} })"

/** The wrapped, invented-API shape Gemini actually returned in the wild. */
const geminiWildReply = `const factory = (host) => {
  Math.seedrandom(host.song.seed);
  return { resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} };
};`

/** A real OpenAI-compatible endpoint; the first reply is bad so authoring retries. */
const startFakeOpenAI = () => {
  let calls = 0
  const server = Bun.serve({
    port: 0,
    routes: {
      "/v1/chat/completions": () => {
        calls += 1
        const content = calls === 1 ? geminiWildReply : visualizationCode
        return Response.json({ choices: [{ message: { role: "assistant", content } }] })
      },
    },
  })
  return { server, calls: () => calls }
}

test("creating a Song authors a visualization and deleting it takes the file along", async () => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-compose-viz-test-"))
  const handle = openDatabase({ path: ":memory:" })
  const fake = startFakeOpenAI()
  try {
    const { app, visualizations } = composeServer({
      db: handle.db,
      mediaDir,
      runYue2Generate: async () =>
        ok({
          flacPath: "/tmp/yuekbox-compose-viz-test/audio.flac",
          scoreAbc: null,
          durationSeconds: 12,
          truncated: { abc: false, semantic: false },
          stages: [],
        }),
      runTranscribe: async () => ok({ scoreAbc: "X:1\nK:C\nC D E F|" }),
      runLyricAlign: async () =>
        ok({ calibration: { cues: [{ text: "hi", startSeconds: 1, endSeconds: 2 }] } }),
      encodeFlacToMp3: async () => ok(Uint8Array.from([1, 2, 3])),
      referenceMaxBytes: 1024,
      service: { version: "0.1.0", state: () => "online", startedAt: "2026-09-17T04:00:00.000Z" },
      dependencies: { ffmpeg: "ok", yue2: "ok", sheetsage2: "ok" },
      now: () => "2026-09-17T04:00:00.000Z",
    })

    const configured = await app.inject({
      method: "PUT",
      url: "/v1/ai/config",
      payload: {
        enabled: true,
        visuals: {
          presetId: "custom",
          baseUrl: `http://127.0.0.1:${fake.server.port}/v1`,
          apiKey: "sk-test",
          model: "gpt-4o",
        },
      },
    })
    expect(configured.statusCode).toBe(200)

    const created = await app.inject({
      method: "POST",
      url: "/v1/songs",
      payload: { lyrics: "hello world", style: "warm piano pop" },
    })
    expect(created.statusCode).toBe(201)
    const queued = SongSchema.parse(created.json())
    const folderKey = `hello-world_${queued.id}`

    await visualizations.drain()

    const visualization = await app.inject({
      method: "GET",
      url: `/v1/songs/${queued.id}/visualization`,
    })
    expect(visualization.statusCode).toBe(200)
    const body = SongVisualizationSchema.parse(visualization.json())
    expect(body.status).toBe("ready")
    expect(body.code).toBe(visualizationCode)
    expect(fake.calls()).toBe(2)
    expect(existsSync(join(mediaDir, folderKey, visualizationFileName))).toBe(true)

    const deleted = await app.inject({ method: "DELETE", url: `/v1/songs/${queued.id}` })
    expect(deleted.statusCode).toBe(204)
    expect(existsSync(join(mediaDir, folderKey, visualizationFileName))).toBe(false)

    const afterDelete = await app.inject({
      method: "GET",
      url: `/v1/songs/${queued.id}/visualization`,
    })
    expect(afterDelete.statusCode).toBe(404)
  } finally {
    void fake.server.stop(true)
    handle.close()
    await rm(mediaDir, { recursive: true, force: true })
  }
})
