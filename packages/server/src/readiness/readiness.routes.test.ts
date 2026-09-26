import { expect, test } from "bun:test"
import { ReadinessSchema } from "contracts/http/readiness"
import Fastify from "fastify"
import { ffmpegCheck, nvidiaCheck } from "./readiness.preflight"
import { readinessRoutes } from "./readiness.routes"

test("GET /v1/readiness answers the contract payload with fixes on failed checks", async () => {
  const app = Fastify()
  await app.register(readinessRoutes, {
    readReadiness: async () => ({
      models: {
        yue2: { state: "missing", path: "/models/YuE2-3B", size: 7_295_775_491 },
        yue2Vae: { state: "ready", path: "/models/YuE2-Vae", size: 531_343_726 },
        sheetsage2: { state: "missing", path: "/models/SheetSage2", size: 233_240_091 },
        sheetsage2Base: {
          state: "missing",
          path: "/models/MERT-v2-FullSong",
          size: 2_530_365_136,
        },
        whisper: {
          state: "missing",
          path: "/models/whisper-large-v3-turbo",
          size: 1_622_466_054,
        },
      },
      system: {
        ffmpeg: ffmpegCheck(false),
        nvidia: nvidiaCheck({ kind: "absent", detail: "no nvidia-smi in this test" }),
      },
    }),
  })

  const response = await app.inject({ method: "GET", url: "/v1/readiness" })

  expect(response.statusCode).toBe(200)
  const parsed = ReadinessSchema.parse(response.json())
  expect(parsed.models.yue2.state).toBe("missing")
  expect(parsed.models.yue2Vae.state).toBe("ready")
  expect(parsed.system.ffmpeg).toEqual(ffmpegCheck(false))
  expect(parsed.system.nvidia).toEqual(
    nvidiaCheck({ kind: "absent", detail: "no nvidia-smi in this test" }),
  )
  await app.close()
})
