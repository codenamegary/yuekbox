import { ReadCurrentModelPaths } from "../config/config.current"
import {
  makeCachedModelSize,
  makeCachedProbe,
  makeMeasurePathSize,
  makePathExists,
} from "./readiness.adapters"
import { ReadinessReader } from "./readiness.models"
import { CheckFfmpeg, ReadGpuFacts } from "./readiness.ports"
import { makeReadReadiness } from "./readiness.read.usecase"

/** nvidia-smi and ffmpeg each cost a process spawn; a poll inside this window reuses the answer. */
export const systemProbeTtlMs = 30_000

/** A present model's byte size costs a directory walk; absence is never cached. */
export const modelSizeTtlMs = 60_000

export type AssembleReadinessDeps = Readonly<{
  /** Resolved per read, so `PUT /v1/config` takes effect with no restart. */
  readModelPaths: ReadCurrentModelPaths
  checkFfmpeg: CheckFfmpeg
  readGpuFacts: ReadGpuFacts
  /** Test seam; the process root leaves it at `Date.now`. */
  now?: () => number
}>

export type ReadinessSlice = Readonly<{ readReadiness: ReadinessReader }>

/**
 * Wires the readiness slice: live existence checks, cached directory sizes,
 * and cached ffmpeg and nvidia-smi probes. The process root supplies the
 * resolved paths and #57's probe capability.
 */
export const assembleReadinessSlice = (deps: AssembleReadinessDeps): ReadinessSlice => {
  const now = deps.now ?? Date.now
  const readReadiness = makeReadReadiness({
    readModelPaths: deps.readModelPaths,
    measureModelSize: makeCachedModelSize({
      pathExists: makePathExists(),
      measurePathSize: makeMeasurePathSize(),
      ttlMs: modelSizeTtlMs,
      now,
    }),
    checkFfmpeg: makeCachedProbe(deps.checkFfmpeg, { ttlMs: systemProbeTtlMs, now }),
    readGpuFacts: makeCachedProbe(deps.readGpuFacts, { ttlMs: systemProbeTtlMs, now }),
  })

  return { readReadiness }
}
