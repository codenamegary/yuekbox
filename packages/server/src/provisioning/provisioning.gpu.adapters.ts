import { ProcessOutcome, ProcessRunner } from "../shared/process"
import { GpuFacts } from "./provisioning.models"
import { ReadGpuFacts } from "./provisioning.ports"

export type GpuAdapterEnv = Readonly<{
  cwd: string
  runProcess: ProcessRunner
}>

/** The one query the probe runs; the driver version is stable across GPUs. */
export const gpuDriverQuery: readonly string[] = Object.freeze([
  "nvidia-smi",
  "--query-gpu=driver_version",
  "--format=csv,noheader",
])

/** First line of nvidia-smi output, when it looks like a driver version. */
export const parseDriverVersion = (stdout: string): string | null => {
  const first = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (first === undefined) return null
  return /^\d+(\.\d+)*$/.test(first) ? first : null
}

/**
 * Asks nvidia-smi for the driver version. Everything that is not a clean
 * answer (missing binary, nonzero exit, no output) becomes `absent`, so the
 * policy in provisioning.gpu.ts decides what to tell the user.
 */
export const makeReadGpuFacts = (env: GpuAdapterEnv): ReadGpuFacts => {
  return async (): Promise<GpuFacts> => {
    let outcome: ProcessOutcome
    try {
      outcome = await env.runProcess(gpuDriverQuery, env.cwd, () => undefined)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { kind: "absent", detail: `nvidia-smi could not run: ${message}` }
    }
    if (outcome.exitCode !== 0) {
      return {
        kind: "absent",
        detail: outcome.stderrTail.trim() || `nvidia-smi exited with code ${outcome.exitCode}`,
      }
    }

    const driverVersion = parseDriverVersion(outcome.stdout)
    if (driverVersion === null) {
      return { kind: "absent", detail: "nvidia-smi reported no driver version" }
    }

    return { kind: "nvidia", driverVersion }
  }
}
