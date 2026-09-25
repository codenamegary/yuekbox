import { ModelPaths } from "contracts/http/config"
import { Readiness } from "contracts/http/readiness"
import { AssembleReadinessDeps } from "./readiness.assembly"
import { expectedModelSizes, ReadinessReader } from "./readiness.models"

const unusedModelPaths: ModelPaths = Object.freeze({
  yue2: "/tmp/yuekbox-unused-readiness/YuE2-3B",
  yue2Vae: "/tmp/yuekbox-unused-readiness/YuE2-Vae",
  sheetsage2: "/tmp/yuekbox-unused-readiness/SheetSage2",
  sheetsage2Base: "/tmp/yuekbox-unused-readiness/MERT-v2-FullSong",
  whisper: "/tmp/yuekbox-unused-readiness/whisper-large-v3-turbo",
})

/** Routes are mounted but readiness is never asserted; the probe is never called. */
export const unusedReadinessFixture = (): ReadinessReader => async (): Promise<Readiness> => ({
  models: {
    yue2: { state: "missing", path: unusedModelPaths.yue2, size: expectedModelSizes.yue2 },
    yue2Vae: { state: "missing", path: unusedModelPaths.yue2Vae, size: expectedModelSizes.yue2Vae },
    sheetsage2: {
      state: "missing",
      path: unusedModelPaths.sheetsage2,
      size: expectedModelSizes.sheetsage2,
    },
    sheetsage2Base: {
      state: "missing",
      path: unusedModelPaths.sheetsage2Base,
      size: expectedModelSizes.sheetsage2Base,
    },
    whisper: {
      state: "missing",
      path: unusedModelPaths.whisper,
      size: expectedModelSizes.whisper,
    },
  },
  system: {
    ffmpeg: { state: "ready" },
    nvidia: { state: "ready" },
  },
})

/** A ready machine; compose tests that never assert readiness use this. */
export const unusedReadinessDepsFixture = (): AssembleReadinessDeps => ({
  readModelPaths: async () => unusedModelPaths,
  checkFfmpeg: async () => true,
  readGpuFacts: async () => ({ kind: "nvidia", driverVersion: "616.56" }),
})
