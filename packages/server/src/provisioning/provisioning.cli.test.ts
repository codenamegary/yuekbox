import { expect, test } from "bun:test"
import { ProvisionProgress } from "./provisioning.models"
import { ProvisionAll } from "./provisioning.ports"
import { runProvisioningCommand } from "./provisioning.cli"

const collectingLog = () => {
  const lines: string[] = []
  return { lines, log: (line: string) => lines.push(line) }
}

const okProvisionAll =
  (events: readonly ProvisionProgress[]): ProvisionAll =>
  async (input) => {
    for (const event of events) input.onProgress?.(event)
    const steps = events.flatMap((event) =>
      event.status === "completed" || event.status === "skipped"
        ? [{ step: event.step, label: event.label, status: event.status }]
        : [],
    )
    return { ok: true, value: { home: input.home, steps } }
  }

const progressEvent = (
  step: ProvisionProgress["step"],
  status: ProvisionProgress["status"],
): ProvisionProgress => ({
  step,
  label: {
    uv: "Setting up yuekbox tools",
    python: "Installing the song engine",
    gpu: "Checking the graphics card",
    environment: "Installing the song tools",
    scripts: "Installing helper programs",
  }[step],
  status,
})

const forbidden = /\b(venv|pip|interpreter|package|python|stack|trace)\b/i

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
  }
}

const activityEvent = (step: ProvisionProgress["step"], detail: string): ProvisionProgress => ({
  ...progressEvent(step, "started"),
  detail,
})

test("prints every step and ends ready", async () => {
  const { lines, log } = collectingLog()
  const provisionAll = okProvisionAll([
    progressEvent("uv", "started"),
    progressEvent("uv", "completed"),
    progressEvent("python", "started"),
    progressEvent("python", "skipped"),
    progressEvent("scripts", "started"),
    progressEvent("scripts", "completed"),
  ])

  const code = await runProvisioningCommand({ home: "/home/u/.yuekbox", provisionAll, log })

  expect(code).toBe(0)
  const output = lines.join("\n")
  expect(output).toContain("Setting up yuekbox tools")
  expect(output).toContain("Installing the song engine")
  expect(output).toContain("already done")
  expect(output).toContain("yuekbox is ready")
  expect(output).not.toMatch(forbidden)
})

test("a failure prints the plain-English message and the retry, then exits nonzero", async () => {
  const { lines, log } = collectingLog()
  const details: string[] = []
  const logDetail = (line: string): void => {
    details.push(line)
  }
  const provisionAll: ProvisionAll = async (input) => {
    input.onProgress?.(progressEvent("uv", "started"))
    input.onProgress?.(progressEvent("uv", "completed"))
    input.onProgress?.(progressEvent("environment", "started"))
    input.onProgress?.(progressEvent("environment", "failed"))
    return {
      ok: false,
      error: {
        step: "environment",
        label: "Installing the song tools",
        kind: "venv_failed",
        detail: "uv pip install exited with code 2: could not find torch==2.10.0",
      },
    }
  }

  const code = await runProvisioningCommand({
    home: "/home/u/.yuekbox",
    provisionAll,
    log,
    logDetail,
  })

  expect(code).toBe(1)
  const output = lines.join("\n")
  expect(output).toContain("song tools")
  expect(output.toLowerCase()).toContain("try again")
  expect(output).toContain("Run yuekbox --provision to retry")
  expect(output).not.toContain("torch")
  expect(output).not.toContain("exited with code")
  expect(output).not.toMatch(forbidden)
  // The raw detail is for diagnosis, not for the happy path: stderr only.
  expect(details.join("\n")).toContain("could not find torch==2.10.0")
})

test("the progress stream is forwarded as it arrives", async () => {
  const { lines, log } = collectingLog()
  const seen: string[] = []
  const provisionAll: ProvisionAll = async (input) => {
    input.onProgress?.({ ...progressEvent("uv", "started"), label: "first" })
    seen.push(lines.join("\n"))
    input.onProgress?.({ ...progressEvent("uv", "completed"), label: "first" })
    return {
      ok: true,
      value: { home: input.home, steps: [{ step: "uv", label: "first", status: "completed" }] },
    }
  }

  await runProvisioningCommand({ home: "/home/u/.yuekbox", provisionAll, log })

  expect(seen[0]).toContain("first")
})

test("on a terminal, uv activity redraws one live line and the step still ends done", async () => {
  const { lines, log } = collectingLog()
  const written: string[] = []
  const details: string[] = []
  const provisionAll: ProvisionAll = async (input) => {
    input.onProgress?.(progressEvent("environment", "started"))
    input.onProgress?.(activityEvent("environment", "Downloading torch-2.10.0-cu128 (799.9MB)"))
    input.onProgress?.(activityEvent("environment", "Installed 40 packages in 3.5s"))
    input.onProgress?.(progressEvent("environment", "completed"))
    return { ok: true, value: { home: input.home, steps: [] } }
  }

  const code = await runProvisioningCommand({
    home: "/home/u/.yuekbox",
    provisionAll,
    log,
    logDetail: (line) => details.push(line),
    write: (text) => written.push(text),
    isTTY: true,
    columns: 120,
    ...manualTimers().timers,
  })

  expect(code).toBe(0)
  expect(written).toEqual([
    "\r\x1b[2K  Installing the song tools (downloading the song tools)...",
    "\r\x1b[2K",
  ])
  expect(lines).toContain("  Installing the song tools...")
  expect(lines).toContain("  done  Installing the song tools")
  // Raw uv lines stay on stderr for diagnosis.
  expect(details).toContain("Downloading torch-2.10.0-cu128 (799.9MB)")
  expect(details).toContain("Installed 40 packages in 3.5s")
})

test("piped output keeps durable lines and never writes control characters", async () => {
  const { lines, log } = collectingLog()
  const written: string[] = []
  const provisionAll: ProvisionAll = async (input) => {
    input.onProgress?.(progressEvent("environment", "started"))
    input.onProgress?.(activityEvent("environment", "Downloading torch-2.10.0-cu128 (799.9MB)"))
    input.onProgress?.(progressEvent("environment", "completed"))
    return { ok: true, value: { home: input.home, steps: [] } }
  }

  const code = await runProvisioningCommand({
    home: "/home/u/.yuekbox",
    provisionAll,
    log,
    write: (text) => written.push(text),
    isTTY: false,
    now: () => 0,
    timers: manualTimers().timers,
  })

  expect(code).toBe(0)
  expect(written).toEqual([])
  const output = lines.join("\n")
  expect(output).not.toContain("\r")
  expect(output).not.toContain("\x1b")
  expect(output).toContain("  done  Installing the song tools")
})

test("uv-derived activity on stdout matches no forbidden word", async () => {
  const { lines, log } = collectingLog()
  const written: string[] = []
  const clock = manualClock()
  const rawLines = [
    "Resolved 40 packages in 1.2s",
    "Downloading torch-2.10.0-cu128 (799.9MB)",
    "Prepared venv packages for python3.12 in 4.5s",
    "Installed 40 packages in 3.5s",
    "Creating virtual environment at: /home/u/.yuekbox/venvs/python",
  ]
  const provisionAll: ProvisionAll = async (input) => {
    input.onProgress?.(progressEvent("environment", "started"))
    for (const line of rawLines) {
      input.onProgress?.(activityEvent("environment", line))
      clock.advance(100) // each line clears the redraw gap, so every phrase draws
    }
    input.onProgress?.(progressEvent("environment", "completed"))
    return { ok: true, value: { home: input.home, steps: [] } }
  }

  const code = await runProvisioningCommand({
    home: "/home/u/.yuekbox",
    provisionAll,
    log,
    write: (text) => written.push(text),
    now: clock.now,
    isTTY: true,
    columns: 120,
    timers: manualTimers().timers,
  })

  expect(code).toBe(0)
  // "Prepared", "Installed", and "Creating" all map to the same phrase; a
  // repeated phrase redraws nothing.
  expect(written).toHaveLength(4)
  const output = [...lines, ...written].join("\n")
  expect(output).not.toMatch(forbidden)
  expect(output).not.toContain("torch")
  expect(output).not.toContain("/home/u")
})

test("a failure clears the live line before the failure message", async () => {
  const { lines, log } = collectingLog()
  const written: string[] = []
  const provisionAll: ProvisionAll = async (input) => {
    input.onProgress?.(progressEvent("environment", "started"))
    input.onProgress?.(activityEvent("environment", "Downloading torch-2.10.0-cu128 (799.9MB)"))
    input.onProgress?.(progressEvent("environment", "failed"))
    return {
      ok: false,
      error: {
        step: "environment",
        label: "Installing the song tools",
        kind: "venv_failed",
        detail: "uv pip install exited with code 2",
      },
    }
  }

  const code = await runProvisioningCommand({
    home: "/home/u/.yuekbox",
    provisionAll,
    log,
    logDetail: () => undefined,
    write: (text) => written.push(text),
    isTTY: true,
    now: () => 0,
    columns: 120,
    timers: manualTimers().timers,
  })

  expect(code).toBe(1)
  expect(written.at(-1)).toBe("\r\x1b[2K")
  expect(lines.join("\n")).toContain("Run yuekbox --provision to retry")
})

test("an unexpected throw clears the live line before the failure message", async () => {
  const { lines, log } = collectingLog()
  const written: string[] = []
  const provisionAll: ProvisionAll = async (input) => {
    input.onProgress?.(progressEvent("environment", "started"))
    input.onProgress?.(activityEvent("environment", "Downloading torch-2.10.0-cu128 (799.9MB)"))
    throw new Error("boom")
  }

  const code = await runProvisioningCommand({
    home: "/home/u/.yuekbox",
    provisionAll,
    log,
    write: (text) => written.push(text),
    isTTY: true,
    now: () => 0,
    columns: 120,
    timers: manualTimers().timers,
  })

  expect(code).toBe(1)
  expect(written.at(-1)).toBe("\r\x1b[2K")
  expect(lines.join("\n")).toContain("yuekbox could not finish setting up")
})

test("an unexpected throw still prints a plain-English failure, not a stack trace", async () => {
  const { lines, log } = collectingLog()
  const provisionAll: ProvisionAll = async () => {
    throw new Error("boom: adapter invariant broke at provisioning.cli.ts:1")
  }

  const code = await runProvisioningCommand({ home: "/home/u/.yuekbox", provisionAll, log })

  expect(code).toBe(1)
  const output = lines.join("\n")
  expect(output).not.toContain("boom")
  expect(output).not.toContain("provisioning.cli.ts")
  expect(output.toLowerCase()).toContain("try again")
  expect(output).toContain("Run yuekbox --provision to retry")
  expect(output).not.toMatch(forbidden)
})
