import { expect, test } from "bun:test"
import { ModelPaths } from "contracts/http/config"
import { assembleReadinessSlice } from "./readiness.assembly"

const modelPaths: ModelPaths = Object.freeze({
  yue2: "/models/YuE2-3B",
  yue2Vae: "/models/YuE2-Vae",
  sheetsage2: "/models/SheetSage2",
  sheetsage2Base: "/models/MERT-v2-FullSong",
  whisper: "/models/whisper-large-v3-turbo",
})

test("assembled readiness reuses the cached system probes across reads", async () => {
  let ffmpegCalls = 0
  let gpuCalls = 0
  const slice = assembleReadinessSlice({
    readModelPaths: async () => modelPaths,
    checkFfmpeg: async () => {
      ffmpegCalls += 1
      return true
    },
    readGpuFacts: async () => {
      gpuCalls += 1
      return { kind: "nvidia", driverVersion: "616.56" }
    },
    now: () => 1_000,
  })

  const first = await slice.readReadiness()
  const second = await slice.readReadiness()

  expect(first).toEqual(second)
  expect(ffmpegCalls).toBe(1)
  expect(gpuCalls).toBe(1)
})
