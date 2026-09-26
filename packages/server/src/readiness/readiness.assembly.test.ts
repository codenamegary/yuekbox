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
  const ffmpegCalls: number[] = []
  const gpuCalls: number[] = []
  const slice = assembleReadinessSlice({
    expectedModelSizes: { yue2: 1, yue2Vae: 1, sheetsage2: 1, sheetsage2Base: 1, whisper: 1 },
    readModelPaths: async () => modelPaths,
    checkFfmpeg: async () => {
      ffmpegCalls.push(1)
      return true
    },
    readGpuFacts: async () => {
      gpuCalls.push(1)
      return { kind: "nvidia", driverVersion: "616.56" }
    },
    now: () => 1_000,
  })

  const first = await slice.readReadiness()
  const second = await slice.readReadiness()

  expect(first).toEqual(second)
  expect(ffmpegCalls).toHaveLength(1)
  expect(gpuCalls).toHaveLength(1)
})
