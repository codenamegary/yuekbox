import { SystemCheck, SystemFix } from "contracts/http/readiness"
import { evaluateGpu, evaluateMacHardware } from "../provisioning/provisioning.gpu"
import { GpuFacts } from "../provisioning/provisioning.models"

/** Copy-paste fix instructions; the same text surfaces for Linux and WSL2. */
const ffmpegFix: SystemFix = Object.freeze({
  linux: "sudo apt install ffmpeg",
  wsl2: "sudo apt update && sudo apt install ffmpeg",
  macos: "brew install ffmpeg",
})

const nvidiaFix: SystemFix = Object.freeze({
  linux: "sudo ubuntu-drivers install",
  wsl2: "Install the latest NVIDIA driver for Windows from https://www.nvidia.com/Download/index.aspx, then run nvidia-smi in WSL2",
})

const appleSiliconFix: SystemFix = Object.freeze({
  macos: "Use an Apple Silicon Mac (M1 or newer) with macOS 14.2 or newer and at least 16 GB of unified memory",
})

/**
 * The system preflight is informational: a pass is `ready`, a failure is a
 * short message plus the install instruction. It never carries a config row
 * and never names anything yuekbox provisions for itself.
 */
export const ffmpegCheck = (available: boolean): SystemCheck =>
  available
    ? { state: "ready" }
    : {
        state: "missing",
        message: "ffmpeg with MP3 support is not installed.",
        fix: ffmpegFix,
      }

/**
 * The GPU check reads whichever facts the machine's probe produced: NVIDIA
 * driver facts on Linux and WSL2, Apple Silicon facts on macOS. It reuses
 * the provisioning evaluators, so the CUDA floor, the macOS floor, the
 * memory floor, and the version parsing live in exactly one place.
 */
export const gpuCheck = (facts: GpuFacts): SystemCheck => {
  switch (facts.kind) {
    case "nvidia": {
      const requirement = evaluateGpu(facts)
      if (requirement.ok) return { state: "ready" }

      switch (requirement.error.kind) {
        case "gpu_missing":
          return {
            state: "missing",
            message: "yuekbox could not find an NVIDIA graphics card or its driver.",
            fix: nvidiaFix,
          }
        case "gpu_driver_too_old":
          return {
            state: "missing",
            message: `The NVIDIA driver is too old for yuekbox: this machine has ${requirement.error.foundDriverVersion ?? "an older driver"} and yuekbox needs ${requirement.error.minimumDriverVersion ?? "a newer one"} or newer.`,
            fix: nvidiaFix,
          }
        case "gpu_unreadable":
        case "gpu_memory_low":
        case "macos_too_old":
          return {
            state: "missing",
            message: "yuekbox could not read the NVIDIA driver version.",
            fix: nvidiaFix,
          }
      }
    }
    case "apple-silicon": {
      const requirement = evaluateMacHardware(facts)
      if (requirement.ok) return { state: "ready" }

      switch (requirement.error.kind) {
        case "macos_too_old":
          return {
            state: "missing",
            message: `macOS is too old for yuekbox: this Mac has ${requirement.error.foundAmount ?? "an older macOS"} and yuekbox needs ${requirement.error.minimumAmount ?? "a newer one"} or newer.`,
            fix: appleSiliconFix,
          }
        case "gpu_memory_low":
          return {
            state: "missing",
            message: `This Mac has ${requirement.error.foundAmount ?? "less"} of unified memory and yuekbox needs ${requirement.error.minimumAmount ?? "more"} to make songs.`,
            fix: appleSiliconFix,
          }
        case "gpu_missing":
        case "gpu_driver_too_old":
        case "gpu_unreadable":
          return {
            state: "missing",
            message: "yuekbox could not read this Mac's hardware information.",
            fix: appleSiliconFix,
          }
      }
    }
    case "absent":
      return {
        state: "missing",
        message:
          "yuekbox could not find a GPU it can use: an NVIDIA graphics card and driver on Linux or WSL2, or an Apple Silicon Mac (M1 or newer) on macOS.",
        fix: { ...nvidiaFix, ...appleSiliconFix },
      }
  }
}
