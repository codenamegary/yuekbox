import { Result } from "../shared/result"
import { GpuFacts, GpuError, TorchRequirement } from "./provisioning.models"
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
