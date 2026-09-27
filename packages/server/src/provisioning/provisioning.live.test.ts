import { expect, test } from "bun:test"
import {
  activityPhrase,
  liveLine,
  LiveLineDeps,
  makeLiveLine,
  stripControl,
  truncateLine,
} from "./provisioning.live"

test("child output loses ANSI escapes and control characters", () => {
  expect(stripControl("\x1b[2KResolved 40 packages\x1b[0m")).toBe("Resolved 40 packages")
  expect(stripControl("Downloading\x07 torch\x00")).toBe("Downloading torch")
  expect(stripControl("\x1b[?25lInstalled\x1b[?25h")).toBe("Installed")
})

test("the live line truncates to columns minus one", () => {
  expect(truncateLine("1234567890", 6)).toBe("12345")
  expect(truncateLine("short", 80)).toBe("short")
})

test("the live line joins the step label and the latest activity", () => {
  expect(liveLine("Installing the song tools", "downloading the song tools")).toBe(
    "  Installing the song tools (downloading the song tools)...",
  )
})

test("uv activity maps to plain English per step", () => {
  expect(activityPhrase("environment", "Downloading torch-2.10.0-cu128 (799.9MB)")).toBe(
    "downloading the song tools",
  )
  expect(activityPhrase("environment", "Resolved 40 packages in 1.2s")).toBe(
    "installing the song tools",
  )
  expect(activityPhrase("environment", "Prepared 12 packages in 4.5s")).toBe(
    "installing the song tools",
  )
  expect(activityPhrase("environment", "Installed 40 packages in 3.5s")).toBe(
    "installing the song tools",
  )
  expect(activityPhrase("python", "Downloading cpython-3.12.3+20240116")).toBe(
    "downloading the song engine",
  )
  expect(activityPhrase("python", "Installing Python 3.12.3 in 812ms")).toBe(
    "installing the song engine",
  )
})

test("an unmatched line maps to null so the last phrase is kept", () => {
  expect(activityPhrase("environment", "error: no solution found")).toBeNull()
  expect(activityPhrase("uv", "Resolved 40 packages")).toBeNull()
  expect(activityPhrase("environment", "\x1b[2K")).toBeNull()
})

/** A controllable millisecond clock so redraw gaps are deterministic. */
const manualClock = () => {
  let milliseconds = 0 // structure: allow-let
  return {
    now: () => milliseconds,
    advance: (ms: number) => {
      milliseconds += ms
    },
  }
}

/** Collecting timer seam: redraws fire only when the test runs them. */
const manualTimers = () => {
  const pending = new Set<() => void>()
  return {
    timers: {
      set: (callback: () => void, _ms: number): unknown => {
        pending.add(callback)
        return callback
      },
      clear: (handle: unknown) => {
        pending.delete(handle as () => void)
      },
    },
    run: () => {
      for (const callback of pending) callback()
    },
    size: () => pending.size,
  }
}

const makeLive = (
  overrides: Partial<LiveLineDeps> & { now?: () => number },
): { written: string[]; live: ReturnType<typeof makeLiveLine> } & ReturnType<
  typeof manualTimers
> => {
  const clock = overrides.now !== undefined ? { now: overrides.now } : manualClock()
  const manual = manualTimers()
  const written: string[] = []
  const live = makeLiveLine({
    enabled: overrides.enabled ?? true,
    write: overrides.write ?? ((text: string) => written.push(text)),
    now: overrides.now ?? clock.now,
    columns: overrides.columns ?? 120,
    gapMs: overrides.gapMs ?? 100,
    timers: overrides.timers ?? manual.timers,
  })
  return { written, live, ...manual }
}

test("the first activity redraws one erased line with the step label and activity", () => {
  const { written, live } = makeLive({})
  live.begin("Installing the song tools")

  live.update("downloading the song tools")

  expect(written).toEqual(["\r\x1b[2K  Installing the song tools (downloading the song tools)..."])
})

test("a burst of activity coalesces into one redraw on the timer", () => {
  const { written, live, run, size } = makeLive({})
  live.begin("Installing the song tools")
  live.update("downloading the song tools")

  live.update("installing the song tools")
  live.update("downloading the song tools")

  expect(written).toHaveLength(1)
  expect(size()).toBe(1)

  run()

  expect(written).toEqual([
    "\r\x1b[2K  Installing the song tools (downloading the song tools)...",
    "\r\x1b[2K  Installing the song tools (downloading the song tools)...",
  ])
})

test("after the gap, new activity redraws immediately again", () => {
  const clock = manualClock()
  const { written, live } = makeLive({ now: clock.now })
  live.begin("Installing the song tools")
  live.update("downloading the song tools")

  clock.advance(100)
  live.update("installing the song tools")

  expect(written).toEqual([
    "\r\x1b[2K  Installing the song tools (downloading the song tools)...",
    "\r\x1b[2K  Installing the song tools (installing the song tools)...",
  ])
})

test("an unmatched line keeps the last phrase and draws nothing", () => {
  const { written, live, size } = makeLive({})
  live.begin("Installing the song tools")
  live.update("downloading the song tools")

  live.update(null)

  expect(written).toHaveLength(1)
  expect(size()).toBe(0)
})

test("clear erases a drawn line and cancels the pending redraw", () => {
  const { written, live, run, size } = makeLive({})
  live.begin("Installing the song tools")
  live.update("downloading the song tools")
  live.update("installing the song tools")

  live.clear()

  expect(written.at(-1)).toBe("\r\x1b[2K")
  expect(size()).toBe(0)
  run()
  expect(written).toHaveLength(2)
})

test("clear without a draw writes nothing", () => {
  const { written, live } = makeLive({})
  live.begin("Installing the song tools")

  live.clear()

  expect(written).toEqual([])
})

test("a live line truncates to the terminal width", () => {
  const { written, live } = makeLive({ columns: 40 })
  live.begin("Installing the song tools")

  live.update("downloading the song tools")

  expect(written[0]).toBe(
    `\r\x1b[2K${liveLine("Installing the song tools", "downloading the song tools").slice(0, 39)}`,
  )
})

test("a live line that is not enabled never writes", () => {
  const { written, live } = makeLive({ enabled: false })
  live.begin("Installing the song tools")
  live.update("downloading the song tools")
  live.clear()

  expect(written).toEqual([])
})
