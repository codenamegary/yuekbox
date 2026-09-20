import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ReferenceSchema } from "contracts/http/references"
import { SongSchema } from "contracts/http/songs"
import { composeServer } from "./compose"
import { openDatabase } from "./db/client"
import { ok } from "./shared/result"
import { generatedAudioFileName, referenceScoreFileName, scoreFileName } from "./songs/songs.files"

const mp3Bytes = Uint8Array.from({ length: 2 * 1024 * 1024 }, (_, index) => index % 251)

test("the wired app drives upload, create, complete, stream, and delete", async () => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-compose-test-"))
  const handle = openDatabase({ path: ":memory:" })
  try {
    const transcribedPaths: string[] = []
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

    generation.worker.wake()
    await generation.worker.drain()

    expect(existsSync(join(mediaDir, folderKey, generatedAudioFileName(queued.id)))).toBe(true)
    expect(existsSync(join(mediaDir, folderKey, scoreFileName))).toBe(true)
    expect(existsSync(join(mediaDir, folderKey, referenceScoreFileName))).toBe(true)
    expect(transcribedPaths).toEqual([referencePath])
    expect(generatedCalls).toEqual([{ cot: "melody", abc: "X:1\nK:C\nC D E|" }])

    const fetched = await app.inject({ method: "GET", url: `/v1/songs/${queued.id}` })
    expect(fetched.statusCode).toBe(200)
    const complete = SongSchema.parse(fetched.json())
    expect(complete.status).toBe("complete")
    expect(complete.scoreAbc).toBe("X:1\nK:C\nC D E F|")
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
