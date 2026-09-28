import { HostPlatform } from "../shared/platform"
import { ProcessOutcome, ProcessRunner } from "../shared/process"
import { err, ok, Result } from "../shared/result"
import { GpuFacts } from "./provisioning.models"
import { ReadGpuFacts } from "./provisioning.ports"

export type GpuAdapterEnv = Readonly<{
  cwd: string
  runProcess: ProcessRunner
  platform: HostPlatform
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

/** The Mac's real architecture, not the process's: Rosetta cannot lie here. */
export const parseMacMachine = (stdout: string): string | null => {
  const first = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  return first === undefined || first === "" ? null : first
}

/** `sysctl hw.memsize` answers one integer of bytes. */
export const parseMemsizeBytes = (stdout: string): number | null => {
  const first = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (first === undefined || !/^\d+$/.test(first)) return null
  const bytes = Number.parseInt(first, 10)
  return bytes > 0 ? bytes : null
}

/** `sw_vers -productVersion` answers something like `15.5`. */
export const parseMacosVersion = (stdout: string): string | null => {
  const first = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (first === undefined || !/^\d+(\.\d+)*$/.test(first)) return null
  return first
}

/** Runs one probe command; a spawn failure becomes its message. */
const probe = async (
  env: GpuAdapterEnv,
  command: readonly string[],
): Promise<Result<ProcessOutcome, string>> => {
  try {
    return ok(await env.runProcess(command, env.cwd, () => undefined))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return err(message)
  }
}

const firstLine = (stdout: string): string | null =>
  stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? null

/**
 * Asks nvidia-smi for the driver version. Everything that is not a clean
 * answer (missing binary, nonzero exit, no output) becomes `absent`, so the
 * policy in provisioning.gpu.ts decides what to tell the user.
 */
const readNvidiaFacts = async (env: GpuAdapterEnv): Promise<GpuFacts> => {
  const probed = await probe(env, gpuDriverQuery)
  if (!probed.ok) {
    return { kind: "absent", detail: `nvidia-smi could not run: ${probed.error}` }
  }
  if (probed.value.exitCode !== 0) {
    return {
      kind: "absent",
      detail:
        probed.value.stderrTail.trim() || `nvidia-smi exited with code ${probed.value.exitCode}`,
    }
  }

  const driverVersion = parseDriverVersion(probed.value.stdout)
  if (driverVersion === null) {
    return { kind: "absent", detail: "nvidia-smi reported no driver version" }
  }

  return { kind: "nvidia", driverVersion }
}

/**
 * Reads one Mac's hardware facts with the tools macOS ships: the real
 * machine architecture, the unified memory size, and the macOS version.
 * Anything unexpected — an Intel Mac, an unparseable answer, a failed
 * probe — becomes `absent`, so one policy decides the user's message.
 */
const readMacFacts = async (env: GpuAdapterEnv): Promise<GpuFacts> => {
  const machine = await probe(env, ["sysctl", "-n", "hw.machine"])
  if (!machine.ok) return { kind: "absent", detail: `sysctl could not run: ${machine.error}` }
  if (machine.value.exitCode !== 0) {
    return {
      kind: "absent",
      detail: machine.value.stderrTail.trim() || `sysctl exited with code ${machine.value.exitCode}`,
    }
  }
  const architecture = parseMacMachine(machine.value.stdout)
  if (architecture !== "arm64") {
    return {
      kind: "absent",
      detail: `macOS on ${architecture ?? "an unknown architecture"} has no GPU yuekbox can use`,
    }
  }

  const memsize = await probe(env, ["sysctl", "-n", "hw.memsize"])
  if (!memsize.ok) return { kind: "absent", detail: `sysctl could not run: ${memsize.error}` }
  if (memsize.value.exitCode !== 0) {
    return {
      kind: "absent",
      detail:
        memsize.value.stderrTail.trim() || `sysctl exited with code ${memsize.value.exitCode}`,
    }
  }
  const memoryBytes = parseMemsizeBytes(memsize.value.stdout)
  if (memoryBytes === null) return { kind: "absent", detail: "sysctl reported no memory size" }

  const swVers = await probe(env, ["sw_vers", "-productVersion"])
  if (!swVers.ok) return { kind: "absent", detail: `sw_vers could not run: ${swVers.error}` }
  if (swVers.value.exitCode !== 0) {
    return {
      kind: "absent",
      detail: swVers.value.stderrTail.trim() || `sw_vers exited with code ${swVers.value.exitCode}`,
    }
  }
  const macosVersion = parseMacosVersion(swVers.value.stdout)
  if (macosVersion === null) {
    return { kind: "absent", detail: `sw_vers reported ${firstLine(swVers.value.stdout) ?? "no version"}` }
  }

  return { kind: "apple-silicon", memoryBytes, macosVersion }
}

/**
 * The machine probe for the platform the binary runs on: nvidia-smi on
 * Linux, the macOS hardware tools on Apple Silicon. Everything either
 * platform cannot answer becomes `absent`, so the evaluators in
 * provisioning.gpu.ts decide what to tell the user.
 */
export const makeReadGpuFacts = (env: GpuAdapterEnv): ReadGpuFacts => {
  return async (): Promise<GpuFacts> =>
    env.platform === "macos" ? await readMacFacts(env) : await readNvidiaFacts(env)
}
