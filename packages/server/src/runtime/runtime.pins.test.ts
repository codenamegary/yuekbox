import { expect, test } from "bun:test"
import { yue2RuntimePin } from "./runtime.pins"

test("the runtime pin names an immutable git source for yue2-infer", () => {
  expect(yue2RuntimePin.package).toBe("yue2-infer")
  expect(yue2RuntimePin.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(yue2RuntimePin.repository).toBe("https://github.com/multimodal-art-projection/YuE.git")
  expect(yue2RuntimePin.commit).toMatch(/^[0-9a-f]{40}$/)
})
