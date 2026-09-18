import { expect, test } from "bun:test"
import {
  baseStageOrder,
  coverStageOrder,
  formatDuration,
  stageLabels,
  stageOrderFor,
  statusLabels,
} from "./songs.stages"

test("formatDuration pads minutes and seconds", () => {
  expect(formatDuration(0)).toBe("00:00")
  expect(formatDuration(65.4)).toBe("01:05")
  expect(formatDuration(194.2)).toBe("03:14")
})

test("stage order covers the five spec stages", () => {
  expect(baseStageOrder).toEqual(["plan", "semantic", "synthesize", "decode", "encode"])
})

test("cover stage order transcribes instead of planning", () => {
  expect(stageOrderFor(false)).toEqual(baseStageOrder)
  expect(stageOrderFor(true)).toEqual(coverStageOrder)
  expect(coverStageOrder).toEqual(["transcribe", "semantic", "synthesize", "decode", "encode"])
})

test("every stage has a label", () => {
  expect(Object.keys(stageLabels).sort()).toEqual([...baseStageOrder, "transcribe"].sort())
})

test("status labels cover every status", () => {
  expect(statusLabels.queued).toBe("Queued")
  expect(statusLabels.failed).toBe("Failed")
})
