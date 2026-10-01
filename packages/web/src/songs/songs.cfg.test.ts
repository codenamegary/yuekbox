import { expect, test } from "bun:test"
import {
  cfgScaleMax,
  cfgScaleMin,
  cfgScalePercent,
  cfgScaleStep,
  cfgScaleSweetHigh,
  cfgScaleSweetLow,
  formatCfgScale,
} from "./songs.cfg"

test("the slider spans the useful band around the default", () => {
  expect(cfgScaleMin).toBe(0)
  expect(cfgScaleMax).toBe(2)
  expect(cfgScaleStep).toBe(0.1)
  expect((cfgScaleMax - cfgScaleMin) / cfgScaleStep).toBeCloseTo(20)
})

test("the default 1.0 lands exactly on a step", () => {
  expect((1 - cfgScaleMin) / cfgScaleStep).toBeCloseTo(10)
})

test("percent maps the scale onto the track", () => {
  expect(cfgScalePercent(cfgScaleMin)).toBe(0)
  expect(cfgScalePercent(1)).toBe(50)
  expect(cfgScalePercent(cfgScaleMax)).toBe(100)
})

test("percent places the sweet-spot marks", () => {
  expect(cfgScalePercent(cfgScaleSweetLow)).toBeCloseTo(35)
  expect(cfgScalePercent(cfgScaleSweetHigh)).toBeCloseTo(70)
})

test("the value reads with one decimal", () => {
  expect(formatCfgScale(1)).toBe("1.0")
  expect(formatCfgScale(0.7)).toBe("0.7")
  expect(formatCfgScale(1.4)).toBe("1.4")
})
