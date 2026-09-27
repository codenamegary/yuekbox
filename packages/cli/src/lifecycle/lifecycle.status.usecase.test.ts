import { expect, test } from "bun:test"
import chalk from "chalk"
import { Status } from "contracts/http/status"
import { pollIntervalMs, RunState } from "./lifecycle.models"
import { makeStatus, StatusDeps } from "./lifecycle.status.usecase"

// The pinned output samples are plain text; color never leaks into assertions.
chalk.level = 0

const startedAt = "2026-09-27T12:00:00.000Z"

const state = (): RunState => ({
  pid: 1234,
  host: "127.0.0.1",
  port: 3000,
  version: "0.4.0",
  startedAt,
  logPath: "/home/you/.yuekbox/logs/yuekbox.log",
})

const service = (): Status => ({
  version: "0.4.0",
  state: "online",
  ffmpeg: "ok",
  yue2: "ok",
  sheetsage2: "ok",
  queueDepth: 2,
  gpuBusy: true,
  startedAt,
})

const harness = (options: {
  lockHeld?: boolean
  stateOnDisk?: RunState | "corrupt"
  probe?: Status | null
  nowMs?: number
}) => {
  const lines: string[] = []
  const deps: StatusDeps = {
    readState: async () => {
      if (options.stateOnDisk === "corrupt") throw new Error("Unexpected token in JSON")
      return options.stateOnDisk ?? null
    },
    probeLock: async () => options.lockHeld !== true,
    probeService: async () => (options.probe === undefined ? service() : options.probe),
    now: () => options.nowMs ?? Date.parse(startedAt) + 724_000,
    out: (line) => lines.push(line),
  }
  return { deps, lines }
}

const input = {
  home: "/home/you/.yuekbox",
  lockPath: "/home/you/.yuekbox/run/yuekbox.lock",
  statePath: "/home/you/.yuekbox/run/yuekbox.json",
  json: false,
}

test("running prints the pinned human block", async () => {
  const h = harness({ lockHeld: true, stateOnDisk: state() })

  const exitCode = await makeStatus(h.deps)(input)

  expect(exitCode).toBe(0)
  expect(h.lines).toEqual([
    "yuekbox is running (pid 1234)",
    "  url       http://127.0.0.1:3000",
    "  home      /home/you/.yuekbox",
    "  version   0.4.0",
    "  uptime    12m 4s",
    "  log       /home/you/.yuekbox/logs/yuekbox.log",
    "  service   online · queue 2 · gpu busy · ffmpeg ok · yue2 ok",
  ])
})

test("stopped prints the pinned line and exits 3", async () => {
  const h = harness({})

  const exitCode = await makeStatus(h.deps)(input)

  expect(exitCode).toBe(3)
  expect(h.lines).toEqual(["yuekbox is not running (home: /home/you/.yuekbox)"])
})

test("running --json prints the pinned shape and field types", async () => {
  const h = harness({ lockHeld: true, stateOnDisk: state() })

  const exitCode = await makeStatus(h.deps)({ ...input, json: true })

  expect(exitCode).toBe(0)
  expect(h.lines).toHaveLength(1)
  const payload = JSON.parse(h.lines[0] ?? "{}") as Record<string, unknown>
  expect(Object.keys(payload)).toEqual([
    "state",
    "pid",
    "url",
    "home",
    "version",
    "startedAt",
    "uptimeSeconds",
    "logPath",
    "service",
  ])
  expect(payload.state).toBe("running")
  expect(payload.pid).toBe(1234)
  expect(payload.url).toBe("http://127.0.0.1:3000")
  expect(payload.home).toBe("/home/you/.yuekbox")
  expect(payload.version).toBe("0.4.0")
  expect(payload.startedAt).toBe(startedAt)
  expect(payload.uptimeSeconds).toBe(724)
  expect(payload.logPath).toBe("/home/you/.yuekbox/logs/yuekbox.log")
  expect(payload.service).toEqual(service())
})

test("stopped --json reports the stopped state and exits 3", async () => {
  const h = harness({})

  const exitCode = await makeStatus(h.deps)({ ...input, json: true })

  expect(exitCode).toBe(3)
  const payload = JSON.parse(h.lines[0] ?? "{}") as Record<string, unknown>
  expect(payload.state).toBe("stopped")
  expect(payload.pid).toBeNull()
  expect(payload.service).toBeNull()
})

test("a failed probe leaves service null and still reports running", async () => {
  const h = harness({ lockHeld: true, stateOnDisk: state(), probe: null })

  const exitCode = await makeStatus(h.deps)(input)

  expect(exitCode).toBe(0)
  expect(h.lines.at(-1)).toBe("  log       /home/you/.yuekbox/logs/yuekbox.log")

  const jsonLines: string[] = []
  await makeStatus({ ...h.deps, out: (line) => jsonLines.push(line) })({ ...input, json: true })
  const payload = JSON.parse(jsonLines[0] ?? "{}") as Record<string, unknown>
  expect(payload.state).toBe("running")
  expect(payload.service).toBeNull()
})

test("a corrupt state file is an error, exit 1", async () => {
  const h = harness({ lockHeld: true, stateOnDisk: "corrupt" })

  const exitCode = await makeStatus(h.deps)(input)

  expect(exitCode).toBe(1)
  expect(h.lines[0]).toContain("could not read its state file")
})

test("the poll interval keeps its pinned cadence", () => {
  expect(pollIntervalMs).toBe(200)
})
