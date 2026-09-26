import { GpuFacts } from "../provisioning/provisioning.models"

/** True when the path exists, file or directory. Cheap: one stat. */
export type PathExists = (path: string) => Promise<boolean>

/** Recursively sums the bytes under an existing path. */
export type MeasurePathSize = (path: string) => Promise<number>

/**
 * Bytes on disk for a model path, or null when the path is missing. Existence
 * is live on every call; the size of a present path is cached.
 */
export type MeasureModelSize = (path: string) => Promise<number | null>

/** True when a system ffmpeg with libmp3lame can encode MP3s. */
export type CheckFfmpeg = () => Promise<boolean>

/**
 * #57's probe and driver evaluation, as a capability the process root wires.
 * Readiness does not restate the CUDA floor; `readiness.preflight.ts` hands
 * these facts to the same `evaluateGpu` provisioning calls.
 */
export type ReadGpuFacts = () => Promise<GpuFacts>
