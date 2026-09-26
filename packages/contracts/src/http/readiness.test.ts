import { expect, test } from "bun:test"
import { Readiness, ReadinessSchema, readinessPath } from "./readiness"

const missingModels: Readiness["models"] = {
  yue2: { state: "missing", path: "/models/YuE2-3B", size: 7_293_868_678 },
  yue2Vae: { state: "missing", path: "/models/YuE2-Vae", size: 531_239_559 },
  sheetsage2: { state: "missing", path: "/models/SheetSage2", size: 230_145_852 },
  sheetsage2Base: { state: "missing", path: "/models/MERT-v2-FullSong", size: 2_530_301_315 },
  whisper: { state: "missing", path: "/models/whisper-large-v3-turbo", size: 1_622_466_054 },
}

test("readinessPath is /v1/readiness", () => {
  expect(readinessPath).toBe("/v1/readiness")
})

test("parses a fixture where every model and check is ready", () => {
  const fixture: Readiness = {
    models: {
      yue2: { state: "ready", path: "/models/YuE2-3B", size: 7_293_868_678 },
      yue2Vae: { state: "ready", path: "/models/YuE2-Vae", size: 531_239_559 },
      sheetsage2: { state: "ready", path: "/models/SheetSage2", size: 230_145_852 },
      sheetsage2Base: { state: "ready", path: "/models/MERT-v2-FullSong", size: 2_530_301_315 },
      whisper: { state: "ready", path: "/models/whisper-large-v3-turbo", size: 1_622_466_054 },
    },
    system: {
      ffmpeg: { state: "ready" },
      nvidia: { state: "ready" },
    },
  }
  expect(ReadinessSchema.parse(fixture)).toEqual(fixture)
})

test("parses missing models and failed checks with a Linux and WSL2 fix", () => {
  const fixture: Readiness = {
    models: missingModels,
    system: {
      ffmpeg: {
        state: "missing",
        message: "ffmpeg with MP3 support is not installed.",
        fix: {
          linux: "sudo apt install ffmpeg",
          wsl2: "sudo apt update && sudo apt install ffmpeg",
        },
      },
      nvidia: {
        state: "missing",
        message: "No NVIDIA graphics driver was found.",
        fix: {
          linux: "sudo ubuntu-drivers install",
          wsl2: "Install the latest NVIDIA driver for Windows, then run nvidia-smi in WSL2.",
        },
      },
    },
  }
  expect(ReadinessSchema.parse(fixture)).toEqual(fixture)
})

test("rejects a failed check without a fix", () => {
  const result = ReadinessSchema.safeParse({
    models: missingModels,
    system: {
      ffmpeg: { state: "missing", message: "ffmpeg with MP3 support is not installed." },
      nvidia: { state: "ready" },
    },
  })
  expect(result.success).toBe(false)
})

test("rejects an unknown model state", () => {
  const result = ReadinessSchema.safeParse({
    models: {
      ...missingModels,
      yue2: { state: "downloading", path: "/models/YuE2-3B", size: 0 },
    },
    system: { ffmpeg: { state: "ready" }, nvidia: { state: "ready" } },
  })
  expect(result.success).toBe(false)
})

test("rejects runtime and venv fields anywhere in the payload", () => {
  const result = ReadinessSchema.safeParse({
    models: missingModels,
    system: { ffmpeg: { state: "ready" }, nvidia: { state: "ready" } },
    python: "ready",
    venv: "/home/u/.yuekbox/venvs/python",
    scripts: "installed",
  })
  expect(result.success).toBe(false)
})
