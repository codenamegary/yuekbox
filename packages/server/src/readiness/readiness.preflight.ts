import { SystemCheck, SystemFix } from "contracts/http/readiness"
import { evaluateGpu } from "../provisioning/provisioning.gpu"
import { GpuFacts } from "../provisioning/provisioning.models"

/** Copy-paste fix instructions; the same text surfaces for Linux and WSL2. */
const ffmpegFix: SystemFix = Object.freeze({
  linux: "sudo apt install ffmpeg",
  wsl2: "sudo apt update && sudo apt install ffmpeg",
})

const nvidiaFix: SystemFix = Object.freeze({
  linux: "sudo ubuntu-drivers install",
  wsl2: "Install the latest NVIDIA driver for Windows from https://www.nvidia.com/Download/index.aspx, then run nvidia-smi in WSL2",
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
 * Reuses #57's driver evaluation, so the CUDA floor and the version parsing
 * live in exactly one place. `absent` facts cover a missing card, a missing
 * driver, and a missing nvidia-smi alike.
 */
export const nvidiaCheck = (facts: GpuFacts): SystemCheck => {
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
      return {
        state: "missing",
        message: "yuekbox could not read the NVIDIA driver version.",
        fix: nvidiaFix,
      }
  }
}
