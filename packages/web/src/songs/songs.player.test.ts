import { expect, test } from "bun:test"
import { seekRatio, writerHidden } from "./songs.player"

test("a pointer inside the seek bar maps to its 0..1 position", () => {
  expect(seekRatio(150, 100, 100)).toBe(0.5)
  expect(seekRatio(100, 100, 100)).toBe(0)
  expect(seekRatio(200, 100, 100)).toBe(1)
})

test("a pointer outside the seek bar clamps to its ends", () => {
  expect(seekRatio(40, 100, 100)).toBe(0)
  expect(seekRatio(260, 100, 100)).toBe(1)
})

test("a zero-width seek bar seeks to the start", () => {
  expect(seekRatio(150, 100, 0)).toBe(0)
})

test("the writer hides only while a complete song plays", () => {
  expect(writerHidden(true, "complete")).toBe(true)
  expect(writerHidden(false, "complete")).toBe(false)
  expect(writerHidden(true, "running")).toBe(false)
  expect(writerHidden(true, null)).toBe(false)
})
