import { expect, test } from "bun:test"
import { visualizationChecksum } from "./visualizations.checksum"

test("the checksum is the SHA-256 of the code", () => {
  expect(visualizationChecksum("")).toBe(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  )
})

test("the same code always answers the same checksum", () => {
  const code = "(host) => ({ renderAudioFrame() {} })"
  expect(visualizationChecksum(code)).toBe(visualizationChecksum(code))
})

test("different code answers different checksums", () => {
  expect(visualizationChecksum("(host) => ({})")).not.toBe(
    visualizationChecksum("(host) => ({ dispose() {} })"),
  )
})
