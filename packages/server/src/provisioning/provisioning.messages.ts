import { ProvisionFailure } from "./provisioning.models"

/**
 * Turns a provisioning stop into the one paragraph a person sees. It names
 * the piece that failed and offers the retry, and it never leaks internal
 * mechanics: no tool names, no paths, no stack frames, no error text.
 */
export const provisionFailureMessage = (failure: ProvisionFailure): string => {
  const retry = "Check your internet connection, then try again."
  switch (failure.kind) {
    case "uv_unavailable":
      return `yuekbox could not set up its own tools on this machine. ${retry}`
    case "python_unavailable":
      return `yuekbox could not install the song engine. ${retry}`
    case "gpu_missing":
      return "yuekbox could not find a GPU it can use to make songs. On Linux and WSL2 yuekbox needs an NVIDIA graphics card and its driver; on macOS it needs an Apple Silicon Mac (M1 or newer). Install the driver for your card, then try again."
    case "gpu_driver_too_old": {
      const found = failure.foundDriverVersion ?? "an older version"
      const minimum = failure.minimumDriverVersion ?? "a newer version"
      return `Your NVIDIA driver is too old for yuekbox: this machine has ${found} and yuekbox needs ${minimum} or newer. Install the latest driver for your card, then try again.`
    }
    case "gpu_unreadable":
      return "yuekbox could not check your graphics driver. Install the latest NVIDIA driver for your card, then try again."
    case "gpu_memory_low": {
      const found = failure.foundAmount ?? "less memory"
      const minimum = failure.minimumAmount ?? "more memory"
      return `This Mac has ${found} of unified memory and yuekbox needs ${minimum} to make songs. Use a Mac with more memory, then try again.`
    }
    case "macos_too_old": {
      const found = failure.foundAmount ?? "an older macOS"
      const minimum = failure.minimumAmount ?? "a newer macOS"
      return `yuekbox needs macOS ${minimum} or newer: this Mac has ${found}. Update macOS, then try again.`
    }
    case "venv_failed":
      return `yuekbox could not finish ${lowercaseFirst(failure.label)}. ${retry}`
    case "scripts_failed":
      return "yuekbox could not install its helper programs. Try again."
  }
}

const lowercaseFirst = (text: string): string =>
  text.length === 0 ? text : `${text[0]?.toLowerCase()}${text.slice(1)}`
