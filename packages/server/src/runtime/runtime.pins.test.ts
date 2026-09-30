import { expect, test } from "bun:test"
import { mlxYueRuntimePin, yue2RuntimePin } from "./runtime.pins"

test("the runtime pin names an immutable git source for yue2-infer", () => {
  expect(yue2RuntimePin.package).toBe("yue2-infer")
  expect(yue2RuntimePin.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(yue2RuntimePin.repository).toBe("https://github.com/multimodal-art-projection/YuE.git")
  expect(yue2RuntimePin.commit).toMatch(/^[0-9a-f]{40}$/)
})

test("the macOS runtime pin names an immutable git source for mlx-yue", () => {
  expect(mlxYueRuntimePin.package).toBe("mlx-yue")
  expect(mlxYueRuntimePin.importName).toBe("lyra")
  expect(mlxYueRuntimePin.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(mlxYueRuntimePin.repository).toBe("https://github.com/vanch007/mlx-Yue.git")
  expect(mlxYueRuntimePin.commit).toMatch(/^[0-9a-f]{40}$/)
})

test("the two runtime pins never share an upstream source", () => {
  expect(mlxYueRuntimePin.repository).not.toBe(yue2RuntimePin.repository)
})
