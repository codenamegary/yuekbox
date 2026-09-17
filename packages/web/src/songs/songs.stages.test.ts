import { expect, test } from "bun:test"
import { formatDuration, stageOrder, statusLabels } from "./songs.stages"

test("formatDuration pads minutes and seconds", () => {
  expect(formatDuration(0)).toBe("00:00")
  expect(formatDuration(65.4)).toBe("01:05")
  expect(formatDuration(194.2)).toBe("03:14")
})

test("stage order covers the five spec stages", () => {
  expect(stageOrder).toEqual(["plan", "semantic", "synthesize", "decode", "encode"])
})

test("status labels cover every status", () => {
  expect(statusLabels.queued).toBe("Queued")
  expect(statusLabels.failed).toBe("Failed")
})
