import { expect, test } from "bun:test"
import { evaluateGpu, minimumTorchDriverVersion } from "./provisioning.gpu"

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
