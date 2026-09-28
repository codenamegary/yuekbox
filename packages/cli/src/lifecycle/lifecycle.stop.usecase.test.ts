import { expect, test } from "bun:test"
import { killGraceMs, pollIntervalMs, RunState } from "./lifecycle.models"
import { makeStop, StopDeps } from "./lifecycle.stop.usecase"

const state = (pid: number): RunState => ({
  pid,
  host: "127.0.0.1",
  port: 3000,
  version: "0.4.0",
  startedAt: new Date().toISOString(),
  logPath: "/home/you/.yuekbox/logs/yuekbox.log",
})

type Harness = {
  deps: StopDeps
  lines: string[]
  calls: {
    signals: ReadonlyArray<{ pid: number; signal: "SIGTERM" | "SIGKILL" }>
    removed: readonly string[]
  }
}

/**
 * The fake lock frees when the fake clock passes `freesAtMs`; the fake clock
 * advances one poll interval per sleep.
 */
const harness = (options: { freesAtMs?: number; stateOnDisk?: RunState | "corrupt" }): Harness => {
  const lines: string[] = []
  const signals: Array<{ pid: number; signal: "SIGTERM" | "SIGKILL" }> = []
  const removed: string[] = []
  const progress = { ms: 0 }
  const freesAtMs = options.freesAtMs ?? 0

  const deps: StopDeps = {
    readState: async () => {
      if (options.stateOnDisk === "corrupt") throw new Error("Unexpected token in JSON")
      return options.stateOnDisk ?? null
    },
    probeLock: async () => progress.ms >= freesAtMs,
    signalPid: async (pid, signal) => {
      signals.push({ pid, signal })
      return true
    },
    now: () => progress.ms,
    sleep: async (ms) => {
      progress.ms += ms
    },
    removePath: async (path) => {
      removed.push(path)
    },
    out: (line) => lines.push(line),
  }
  return { deps, lines, calls: { signals, removed } }
}

const input = {
  lockPath: "/home/you/.yuekbox/run/yuekbox.lock",
  statePath: "/home/you/.yuekbox/run/yuekbox.json",
}

test("not running exits 0 without signaling anything", async () => {
  const h = harness({})

  const exitCode = await makeStop(h.deps)(input)

  expect(exitCode).toBe(0)
  expect(h.lines).toEqual(["yuekbox is not running"])
  expect(h.calls.signals).toEqual([])
  expect(h.calls.removed).toEqual([])
})

test("a stale state file with a free lock is cleaned up", async () => {
  const h = harness({ stateOnDisk: state(42) })

  const exitCode = await makeStop(h.deps)(input)

  expect(exitCode).toBe(0)
  expect(h.lines).toEqual(["yuekbox is not running"])
  expect(h.calls.signals).toEqual([])
  expect(h.calls.removed).toEqual([input.statePath])
})

test("a running instance gets SIGTERM and the stop waits for the lock to free", async () => {
  const h = harness({ stateOnDisk: state(1234), freesAtMs: pollIntervalMs * 5 })

  const exitCode = await makeStop(h.deps)(input)

  expect(exitCode).toBe(0)
  expect(h.lines).toEqual(["waiting for pid 1234 to exit…", "yuekbox stopped"])
  expect(h.calls.signals).toEqual([{ pid: 1234, signal: "SIGTERM" }])
  expect(h.calls.removed).toEqual([input.statePath])
})

test("a 10 s holdout gets SIGKILL", async () => {
  // The lock never frees on SIGTERM; it frees inside the SIGKILL grace.
  const h = harness({
    stateOnDisk: state(1234),
    freesAtMs: 10_000 + killGraceMs / 2,
  })

  const exitCode = await makeStop(h.deps)(input)

  expect(exitCode).toBe(0)
  expect(h.calls.signals).toEqual([
    { pid: 1234, signal: "SIGTERM" },
    { pid: 1234, signal: "SIGKILL" },
  ])
  expect(h.lines[1]).toBe("yuekbox stopped")
})

test("a process that will not die fails with exit 1", async () => {
  const h = harness({ stateOnDisk: state(1234), freesAtMs: Infinity })

  const exitCode = await makeStop(h.deps)(input)

  expect(exitCode).toBe(1)
  expect(h.calls.signals).toEqual([
    { pid: 1234, signal: "SIGTERM" },
    { pid: 1234, signal: "SIGKILL" },
  ])
  expect(h.lines).toEqual(["waiting for pid 1234 to exit…", "yuekbox (pid 1234) did not stop"])
})

test("a held lock with an unreadable state file fails instead of guessing", async () => {
  const h = harness({ stateOnDisk: "corrupt", freesAtMs: Infinity })

  const exitCode = await makeStop(h.deps)(input)

  expect(exitCode).toBe(1)
  expect(h.calls.signals).toEqual([])
  expect(h.lines[0]).toContain("could not be read")
})
