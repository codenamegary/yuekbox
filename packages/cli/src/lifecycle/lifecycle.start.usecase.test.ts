import { expect, test } from "bun:test"
import { logRotateBytes, pollIntervalMs, RunState } from "./lifecycle.models"
import { makeStart, StartDeps } from "./lifecycle.start.usecase"

const state = (pid: number): RunState => ({
  pid,
  host: "127.0.0.1",
  port: 3000,
  version: "0.4.0",
  startedAt: new Date().toISOString(),
  logPath: "/home/you/.yuekbox/logs/yuekbox.log",
})

type Harness = {
  deps: StartDeps
  lines: string[]
  calls: { spawned: number; rotated: number; cmds: ReadonlyArray<readonly string[]> }
}

const harness = (options: {
  /** The lock is held before start runs: the already-running branch. */
  lockHeld?: boolean
  /** Polls before the child's state file appears; Infinity means never. */
  stateAfterPolls?: number
  /** The child's exit code, or null for a child that keeps running. */
  childExitCode?: number | null
  /** Milliseconds the fake clock advances per poll. */
  tickMs?: number
}): Harness => {
  const lines: string[] = []
  const calls = { spawned: 0, rotated: 0, cmds: [] as ReadonlyArray<readonly string[]> }
  const progress = { polls: 0, ms: 0 }
  const child = state(777)

  const deps: StartDeps = {
    probeLock: async () => options.lockHeld !== true,
    spawnDetached: async (request) => {
      calls.spawned += 1
      calls.cmds = [...calls.cmds, request.cmd]
      return {
        pid: 777,
        exited:
          options.childExitCode === null || options.childExitCode === undefined
            ? new Promise<number>(() => undefined)
            : Promise.resolve(options.childExitCode),
      }
    },
    readState: async () => {
      progress.polls += 1
      return (options.stateAfterPolls ?? Infinity) <= progress.polls ? child : null
    },
    readLogTail: async () => "the python helper is missing (boom)",
    rotateLog: async () => {
      calls.rotated += 1
      return false
    },
    now: () => progress.ms,
    sleep: async () => {
      progress.ms += options.tickMs ?? pollIntervalMs
    },
    out: (line) => lines.push(line),
  }
  return { deps, lines, calls }
}

const input = {
  lockPath: "/home/you/.yuekbox/run/yuekbox.lock",
  statePath: "/home/you/.yuekbox/run/yuekbox.json",
  logPath: "/home/you/.yuekbox/logs/yuekbox.log",
  cmd: ["/usr/local/bin/yuekbox", "--daemon-child", "--home", "/home/you/.yuekbox"],
}

test("a fresh start rotates the log, spawns the daemon, and reports the state file", async () => {
  const h = harness({ stateAfterPolls: 3 })

  const exitCode = await makeStart(h.deps)(input)

  expect(exitCode).toBe(0)
  expect(h.calls.rotated).toBe(1)
  expect(h.calls.spawned).toBe(1)
  expect(h.calls.cmds[0]).toEqual(input.cmd)
  expect(h.lines).toEqual([
    "yuekbox started (pid 777)",
    "  url   http://127.0.0.1:3000",
    `  log   ${input.logPath}`,
  ])
})

test("an already running instance reports the pid and spawns nothing", async () => {
  const h = harness({ lockHeld: true, stateAfterPolls: 0 })

  const exitCode = await makeStart(h.deps)(input)

  expect(exitCode).toBe(0)
  expect(h.calls.spawned).toBe(0)
  expect(h.calls.rotated).toBe(0)
  expect(h.lines).toEqual(["yuekbox is already running (pid 777)", "  url   http://127.0.0.1:3000"])
})

test("an early child death reports the log tail and fails", async () => {
  const h = harness({ childExitCode: 1, stateAfterPolls: Infinity })

  const exitCode = await makeStart(h.deps)(input)

  expect(exitCode).toBe(1)
  expect(h.calls.spawned).toBe(1)
  expect(h.lines[0]).toBe("yuekbox failed to start")
  expect(h.lines[1]).toBe("the python helper is missing (boom)")
})

test("a child that never writes its state file times out", async () => {
  const h = harness({ childExitCode: null, stateAfterPolls: Infinity, tickMs: 1_000 })

  const exitCode = await makeStart(h.deps)(input)

  expect(exitCode).toBe(1)
  expect(h.calls.spawned).toBe(1)
  expect(h.lines[0]).toBe("yuekbox failed to start")
  expect(h.lines[1]).toBe("the python helper is missing (boom)")
})

test("the log rotation size matches the pinned 5 MiB constant", () => {
  expect(logRotateBytes).toBe(5 * 1024 * 1024)
})
