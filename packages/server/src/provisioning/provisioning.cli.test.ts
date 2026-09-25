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
    yue2: "Installing the song generator",
    sheetsage2: "Installing reference transcription",
    lyricalign: "Installing lyric timing",
    scripts: "Installing helper programs",
  }[step],
  status,
})

const forbidden = /\b(venv|pip|interpreter|package|python|stack|trace)\b/i

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
  const provisionAll: ProvisionAll = async (input) => {
    input.onProgress?.(progressEvent("uv", "started"))
    input.onProgress?.(progressEvent("uv", "completed"))
    input.onProgress?.(progressEvent("yue2", "started"))
    input.onProgress?.(progressEvent("yue2", "failed"))
    return {
      ok: false,
      error: {
        step: "yue2",
        label: "Installing the song generator",
        kind: "venv_failed",
        detail: "uv pip install exited with code 2: could not find torch==2.10.0",
      },
    }
  }

  const code = await runProvisioningCommand({ home: "/home/u/.yuekbox", provisionAll, log })

  expect(code).toBe(1)
  const output = lines.join("\n")
  expect(output).toContain("song generator")
  expect(output.toLowerCase()).toContain("try again")
  expect(output).not.toContain("torch")
  expect(output).not.toContain("exited with code")
  expect(output).not.toMatch(forbidden)
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
  expect(output).not.toMatch(forbidden)
})
