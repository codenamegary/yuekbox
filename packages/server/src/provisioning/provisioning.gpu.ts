import { Result } from "../shared/result"
import {
  GpuFacts,
  GpuError,
  MacRequirement,
  MachineRequirement,
  TorchRequirement,
} from "./provisioning.models"
import { torchWheelIndexUrl } from "./provisioning.packages"

/**
 * CUDA 12 binaries run on any 12.x driver, per NVIDIA's minor version
 * compatibility rule. The one pinned torch build is a CUDA 12.x build, so
 * this is the floor that runs it:
 * https://docs.nvidia.com/deploy/cuda-compatibility/
 *
 * The shared environment runs torch 2.10.0+cu128 (the tested local
 * reference), so the requirement names the cu128 index.
 */
export const minimumTorchDriverVersion = "525.60.13"

/**
 * The Apple Silicon floor the MLX runtime documents: macOS 14.2 or newer,
 * and at least 16 GiB of unified memory, which is also the sampled budget
 * the runtime enforces while generating. The floor is the total memory
 * `sysctl hw.memsize` reports.
 */
export const minimumMacosVersion = "14.2"
export const minimumUnifiedMemoryBytes = 16 * 1024 ** 3
export const memoryBudgetGiB = 16

export const torchRequirement: TorchRequirement = Object.freeze({
  cudaFamily: "12.x",
  indexUrl: torchWheelIndexUrl,
  minimumDriverVersion: minimumTorchDriverVersion,
})

const parseVersion = (version: string): readonly number[] | null => {
  if (!/^\d+(\.\d+)*$/.test(version)) return null
  return version.split(".").map((part) => Number.parseInt(part, 10))
}

const isAtLeast = (version: readonly number[], minimum: readonly number[]): boolean => {
  const length = Math.max(version.length, minimum.length)
  const padded = (parts: readonly number[]): readonly number[] =>
    Array.from({ length }, (_, index) => parts[index] ?? 0)
  const left = padded(version)
  const right = padded(minimum)
  const differing = left.findIndex((value, index) => value !== right[index])
  if (differing === -1) return true
  return (left[differing] ?? 0) > (right[differing] ?? 0)
}

/**
 * Decides whether the machine can run the pinned torch builds and, when it
 * can, reports the CUDA 12 wheel requirement provisioning installs against.
 * A driver older than the floor gets an install instruction through the
 * user-facing message mapper.
 */
export const evaluateGpu = (facts: GpuFacts): Result<TorchRequirement, GpuError> => {
  if (facts.kind === "absent") {
    return { ok: false, error: { kind: "gpu_missing", detail: facts.detail } }
  }

  const found = parseVersion(facts.driverVersion)
  const minimum = parseVersion(minimumTorchDriverVersion)
  if (found === null || minimum === null) {
    return {
      ok: false,
      error: {
        kind: "gpu_unreadable",
        detail: `unreadable driver version: ${facts.driverVersion}`,
      },
    }
  }

  if (!isAtLeast(found, minimum)) {
    return {
      ok: false,
      error: {
        kind: "gpu_driver_too_old",
        detail: `driver ${facts.driverVersion} is older than the required ${minimumTorchDriverVersion}`,
        foundDriverVersion: facts.driverVersion,
        minimumDriverVersion: minimumTorchDriverVersion,
      },
    }
  }

  return { ok: true, value: torchRequirement }
}

const describeBytes = (bytes: number): string => `${Math.round(bytes / 1024 ** 3)} GiB`

/**
 * Decides whether a Mac can run the MLX runtime: Apple Silicon under the
 * macOS floor, with at least the unified memory the generation budget
 * assumes. An Intel Mac, a Hackintosh, or a failed probe never reaches this
 * evaluator as Apple Silicon facts — the adapter reports those as `absent`.
 */
export const evaluateMacHardware = (facts: {
  kind: "apple-silicon"
  memoryBytes: number
  macosVersion: string
}): Result<MacRequirement, GpuError> => {
  if (!Number.isFinite(facts.memoryBytes) || facts.memoryBytes <= 0) {
    return {
      ok: false,
      error: { kind: "gpu_unreadable", detail: "could not read the unified memory size" },
    }
  }

  const macos = parseVersion(facts.macosVersion)
  const macosFloor = parseVersion(minimumMacosVersion)
  if (macos === null || macosFloor === null) {
    return {
      ok: false,
      error: { kind: "gpu_unreadable", detail: `unreadable macOS version: ${facts.macosVersion}` },
    }
  }
  if (!isAtLeast(macos, macosFloor)) {
    return {
      ok: false,
      error: {
        kind: "macos_too_old",
        detail: `macOS ${facts.macosVersion} is older than the required ${minimumMacosVersion}`,
        foundAmount: facts.macosVersion,
        minimumAmount: minimumMacosVersion,
      },
    }
  }

  if (facts.memoryBytes < minimumUnifiedMemoryBytes) {
    return {
      ok: false,
      error: {
        kind: "gpu_memory_low",
        detail: `unified memory ${describeBytes(facts.memoryBytes)} is below the required ${describeBytes(minimumUnifiedMemoryBytes)}`,
        foundAmount: describeBytes(facts.memoryBytes),
        minimumAmount: describeBytes(minimumUnifiedMemoryBytes),
      },
    }
  }

  return { ok: true, value: { memoryBudgetGiB } }
}

/**
 * The one machine check both platforms answer. The probe produces the facts
 * variant for its platform; this decides what the machine can run. The
 * failure kinds and details are platform-neutral enough for one message map.
 */
export const evaluateMachine = (
  facts: GpuFacts,
): Result<MachineRequirement, GpuError> => {
  switch (facts.kind) {
    case "nvidia": {
      const torch = evaluateGpu(facts)
      return torch.ok ? { ok: true, value: { kind: "cuda", indexUrl: torch.value.indexUrl } } : torch
    }
    case "apple-silicon": {
      const mac = evaluateMacHardware(facts)
      return mac.ok
        ? { ok: true, value: { kind: "mlx", memoryBudgetGiB: mac.value.memoryBudgetGiB } }
        : mac
    }
    case "absent":
      return { ok: false, error: { kind: "gpu_missing", detail: facts.detail } }
  }
}
