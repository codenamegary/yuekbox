import { describe, expect, test } from "bun:test"
import {
  initialOverlayState,
  stepOverlay,
  OverlayState,
  overlayCloseDelayMs,
} from "./songs.overlay.machine"

const shown: OverlayState = { phase: "shown" }
const closing: OverlayState = { phase: "closing" }

describe("stepOverlay", () => {
  test("generate shows the overlay", () => {
    expect(stepOverlay(initialOverlayState, { type: "generate" })).toEqual(shown)
    expect(stepOverlay({ phase: "closing" }, { type: "generate" })).toEqual(shown)
    expect(stepOverlay(shown, { type: "generate" })).toEqual(shown)
  })

  test("the sigil shows a dismissed overlay", () => {
    expect(stepOverlay(initialOverlayState, { type: "show" })).toEqual(shown)
    expect(stepOverlay(closing, { type: "show" })).toEqual(shown)
  })

  test("dismiss hides the overlay from any phase", () => {
    expect(stepOverlay(shown, { type: "dismiss" })).toEqual(initialOverlayState)
    expect(stepOverlay(closing, { type: "dismiss" })).toEqual(initialOverlayState)
    expect(stepOverlay(initialOverlayState, { type: "dismiss" })).toEqual(initialOverlayState)
  })

  test("completion parks a visible overlay to close after a beat", () => {
    const next = stepOverlay(shown, { type: "songComplete" })
    expect(next).toEqual(closing)
    expect(overlayCloseDelayMs).toBeGreaterThan(0)
  })

  test("completion never pops a dismissed overlay back up", () => {
    expect(stepOverlay(initialOverlayState, { type: "songComplete" })).toEqual(initialOverlayState)
  })

  test("failure holds the overlay open", () => {
    expect(stepOverlay(shown, { type: "songFailed" })).toEqual(shown)
    expect(stepOverlay(initialOverlayState, { type: "songFailed" })).toEqual(initialOverlayState)
  })

  test("the close beat hides the overlay", () => {
    expect(stepOverlay(closing, { type: "closeElapsed" })).toEqual(initialOverlayState)
    expect(stepOverlay(shown, { type: "closeElapsed" })).toEqual(shown)
    expect(stepOverlay(initialOverlayState, { type: "closeElapsed" })).toEqual(initialOverlayState)
  })
})
