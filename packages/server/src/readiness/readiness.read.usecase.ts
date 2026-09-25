import { ModelReadiness, Readiness } from "contracts/http/readiness"
import { ReadCurrentModelPaths } from "../config/config.current"
import { expectedModelSizes, ModelReadinessKey } from "./readiness.models"
import { CheckFfmpeg, MeasureModelSize, ReadGpuFacts } from "./readiness.ports"
import { ffmpegCheck, nvidiaCheck } from "./readiness.preflight"

export type ReadReadinessDeps = Readonly<{
  /** Resolved per read, so a saved path takes effect with no restart. */
  readModelPaths: ReadCurrentModelPaths
  measureModelSize: MeasureModelSize
  checkFfmpeg: CheckFfmpeg
  readGpuFacts: ReadGpuFacts
}>

/**
 * One readiness snapshot: the five models plus the system preflight. It reads
 * model + machine state only; runtimes, venvs, and helper scripts are ours and
 * are never part of this report.
 */
export const makeReadReadiness = (deps: ReadReadinessDeps) => async (): Promise<Readiness> => {
  const modelPaths = await deps.readModelPaths()

  const readModel = async (key: ModelReadinessKey): Promise<ModelReadiness> => {
    const path = modelPaths[key]
    const size = await deps.measureModelSize(path)
    return size === null
      ? { state: "missing", path, size: expectedModelSizes[key] }
      : { state: "ready", path, size }
  }

  const [yue2, yue2Vae, sheetsage2, sheetsage2Base, whisper] = await Promise.all([
    readModel("yue2"),
    readModel("yue2Vae"),
    readModel("sheetsage2"),
    readModel("sheetsage2Base"),
    readModel("whisper"),
  ])
  const [ffmpegAvailable, gpuFacts] = await Promise.all([deps.checkFfmpeg(), deps.readGpuFacts()])

  return {
    models: { yue2, yue2Vae, sheetsage2, sheetsage2Base, whisper },
    system: {
      ffmpeg: ffmpegCheck(ffmpegAvailable),
      nvidia: nvidiaCheck(gpuFacts),
    },
  }
}
