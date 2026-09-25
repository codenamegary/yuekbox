import { expect, test } from "bun:test"
import { ModelPaths } from "contracts/http/config"
import { GpuFacts } from "../provisioning/provisioning.models"
import { expectedModelSizes, modelReadinessKeys } from "./readiness.models"
import { makeReadReadiness } from "./readiness.read.usecase"

const modelPaths: ModelPaths = Object.freeze({
  yue2: "/models/YuE2-3B",
  yue2Vae: "/models/YuE2-Vae",
  sheetsage2: "/models/SheetSage2",
  sheetsage2Base: "/models/MERT-v2-FullSong",
  whisper: "/models/whisper-large-v3-turbo",
})

const readyDeps = {
  checkFfmpeg: async () => true,
  readGpuFacts: async (): Promise<GpuFacts> => ({ kind: "nvidia", driverVersion: "616.56" }),
}

test("reports every model missing with its resolved path and expected size", async () => {
  const readReadiness = makeReadReadiness({
    readModelPaths: async () => modelPaths,
    measureModelSize: async () => null,
    ...readyDeps,
  })

  const report = await readReadiness()

  for (const key of modelReadinessKeys) {
    expect(report.models[key]).toEqual({
      state: "missing",
      path: modelPaths[key],
      size: expectedModelSizes[key],
    })
  }
  expect(report.system).toEqual({
    ffmpeg: { state: "ready" },
    nvidia: { state: "ready" },
  })
})

test("reports every model ready with the bytes on disk", async () => {
  const bytesByPath = new Map<string, number>([
    [modelPaths.yue2, 11],
    [modelPaths.yue2Vae, 22],
    [modelPaths.sheetsage2, 33],
    [modelPaths.sheetsage2Base, 44],
    [modelPaths.whisper, 55],
  ])
  const readReadiness = makeReadReadiness({
    readModelPaths: async () => modelPaths,
    measureModelSize: async (path) => bytesByPath.get(path) ?? null,
    ...readyDeps,
  })

  const report = await readReadiness()

  for (const key of modelReadinessKeys) {
    expect(report.models[key]).toEqual({
      state: "ready",
      path: modelPaths[key],
      size: bytesByPath.get(modelPaths[key]) ?? 0,
    })
  }
})

test("expected sizes come from the upstream repositories read on 2026-09-24", () => {
  expect(expectedModelSizes).toEqual({
    yue2: 7_295_775_491,
    yue2Vae: 531_343_726,
    sheetsage2: 233_240_091,
    sheetsage2Base: 2_530_365_136,
    whisper: 1_622_466_054,
  })
})

test("a missing ffmpeg comes with the Linux and WSL2 fix instruction", async () => {
  const readReadiness = makeReadReadiness({
    readModelPaths: async () => modelPaths,
    measureModelSize: async () => null,
    ...readyDeps,
    checkFfmpeg: async () => false,
  })

  const check = (await readReadiness()).system.ffmpeg

  expect(check.state).toBe("missing")
  if (check.state !== "missing") return
  expect(check.message).toContain("ffmpeg")
  expect(check.fix.linux).toContain("ffmpeg")
  expect(check.fix.wsl2).toContain("ffmpeg")
})

const missingGpuFacts: readonly GpuFacts[] = [
  { kind: "absent", detail: "nvidia-smi could not run" },
  { kind: "nvidia", driverVersion: "470.10" },
  { kind: "nvidia", driverVersion: "not-a-version" },
]

test("a failed driver check comes with the Linux and WSL2 fix instruction", async () => {
  for (const facts of missingGpuFacts) {
    const readReadiness = makeReadReadiness({
      readModelPaths: async () => modelPaths,
      measureModelSize: async () => null,
      ...readyDeps,
      readGpuFacts: async () => facts,
    })

    const check = (await readReadiness()).system.nvidia

    expect(check.state).toBe("missing")
    if (check.state !== "missing") continue
    expect(check.message.length).toBeGreaterThan(0)
    expect(check.fix.linux.length).toBeGreaterThan(0)
    expect(check.fix.wsl2.length).toBeGreaterThan(0)
  }
})

test("an old driver message names both versions", async () => {
  const readReadiness = makeReadReadiness({
    readModelPaths: async () => modelPaths,
    measureModelSize: async () => null,
    ...readyDeps,
    readGpuFacts: async () => ({ kind: "nvidia", driverVersion: "470.10" }),
  })

  const check = (await readReadiness()).system.nvidia

  expect(check.state).toBe("missing")
  if (check.state !== "missing") return
  expect(check.message).toContain("470.10")
  expect(check.message).toContain("525.60.13")
})

test("never reports a runtime, venv, or helper script", async () => {
  const readReadiness = makeReadReadiness({
    readModelPaths: async () => modelPaths,
    measureModelSize: async () => null,
    ...readyDeps,
    checkFfmpeg: async () => false,
    readGpuFacts: async () => ({ kind: "absent", detail: "no gpu" }),
  })

  const serialized = JSON.stringify(await readReadiness()).toLowerCase()

  expect(serialized).not.toContain("python")
  expect(serialized).not.toContain("venv")
  expect(serialized).not.toContain("runtime")
  expect(serialized).not.toContain("script")
})
