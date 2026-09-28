import { expect, test } from "bun:test"
import {
  evaluateGpu,
  evaluateMachine,
  evaluateMacHardware,
  minimumMacosVersion,
  minimumTorchDriverVersion,
  minimumUnifiedMemoryBytes,
} from "./provisioning.gpu"

test("a driver at the CUDA 12 floor passes and chooses the CUDA 12.8 wheels", () => {
  const result = evaluateGpu({ kind: "nvidia", driverVersion: minimumTorchDriverVersion })

  expect(result).toEqual({
    ok: true,
    value: {
      cudaFamily: "12.x",
      indexUrl: "https://download.pytorch.org/whl/cu128",
      minimumDriverVersion: minimumTorchDriverVersion,
    },
  })
})

test("a newer driver passes", () => {
  const result = evaluateGpu({ kind: "nvidia", driverVersion: "616.56" })

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.indexUrl).toBe("https://download.pytorch.org/whl/cu128")
})

test("an older driver fails and names both the found and the minimum version", () => {
  const result = evaluateGpu({ kind: "nvidia", driverVersion: "470.82" })

  expect(result).toEqual({
    ok: false,
    error: {
      kind: "gpu_driver_too_old",
      detail: "driver 470.82 is older than the required 525.60.13",
      foundDriverVersion: "470.82",
      minimumDriverVersion: "525.60.13",
    },
  })
})

test("a driver just below the floor fails", () => {
  const result = evaluateGpu({ kind: "nvidia", driverVersion: "525.60.12" })

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("gpu_driver_too_old")
})

test("numeric comparison is not lexicographic", () => {
  const result = evaluateGpu({ kind: "nvidia", driverVersion: "100.0" })

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("gpu_driver_too_old")
})

test("a machine with no NVIDIA facts fails as missing", () => {
  const result = evaluateGpu({ kind: "absent", detail: "nvidia-smi not found" })

  expect(result).toEqual({
    ok: false,
    error: { kind: "gpu_missing", detail: "nvidia-smi not found" },
  })
})

test("an unparseable driver version fails as unreadable", () => {
  const result = evaluateGpu({ kind: "nvidia", driverVersion: "not-a-version" })

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("gpu_unreadable")
  expect(result.error.detail).toContain("not-a-version")
})

test("a four-part driver version still compares numerically", () => {
  const result = evaluateGpu({ kind: "nvidia", driverVersion: "525.60.13.1" })

  expect(result.ok).toBe(true)
})

const macFacts = (overrides: Partial<{ memoryBytes: number; macosVersion: string }> = {}) => ({
  kind: "apple-silicon" as const,
  memoryBytes: 36 * 1024 ** 3,
  macosVersion: "15.5",
  ...overrides,
})

test("an Apple Silicon Mac at the memory floor passes with the MLX budget", () => {
  const result = evaluateMacHardware(macFacts({ memoryBytes: minimumUnifiedMemoryBytes }))

  expect(result).toEqual({ ok: true, value: { memoryBudgetGiB: 16 } })
})

test("a Mac below the unified memory floor fails and names both amounts", () => {
  const result = evaluateMacHardware(macFacts({ memoryBytes: 8 * 1024 ** 3 }))

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("gpu_memory_low")
  expect(result.error.foundAmount).toBe("8 GiB")
  expect(result.error.minimumAmount).toBe("16 GiB")
})

test("a Mac below the macOS floor fails", () => {
  const result = evaluateMacHardware(macFacts({ macosVersion: "14.1" }))

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("macos_too_old")
  expect(result.error.foundAmount).toBe("14.1")
  expect(result.error.minimumAmount).toBe(minimumMacosVersion)
})

test("the macOS floor itself passes and patch versions are ignored for the floor", () => {
  expect(evaluateMacHardware(macFacts({ macosVersion: "14.2" })).ok).toBe(true)
  expect(evaluateMacHardware(macFacts({ macosVersion: "14.2.1" })).ok).toBe(true)
})

test("an unparseable macOS version or memory size fails as unreadable", () => {
  const version = evaluateMacHardware(macFacts({ macosVersion: "Tahoe" }))
  expect(version.ok).toBe(false)
  if (!version.ok) expect(version.error.kind).toBe("gpu_unreadable")

  const memory = evaluateMacHardware(macFacts({ memoryBytes: Number.NaN }))
  expect(memory.ok).toBe(false)
  if (!memory.ok) expect(memory.error.kind).toBe("gpu_unreadable")
})

test("the machine check dispatches each platform's facts to its own evaluator", () => {
  const cuda = evaluateMachine({ kind: "nvidia", driverVersion: minimumTorchDriverVersion })
  expect(cuda).toEqual({
    ok: true,
    value: { kind: "cuda", indexUrl: "https://download.pytorch.org/whl/cu128" },
  })

  const mlx = evaluateMachine(macFacts())
  expect(mlx).toEqual({ ok: true, value: { kind: "mlx", memoryBudgetGiB: 16 } })

  const absent = evaluateMachine({ kind: "absent", detail: "no probe" })
  expect(absent).toEqual({ ok: false, error: { kind: "gpu_missing", detail: "no probe" } })
})
