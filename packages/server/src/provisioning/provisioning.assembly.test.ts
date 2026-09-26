import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProcessRunner } from "../shared/process"
import { assembleProvisioningSlice } from "./provisioning.assembly"

const withTempDir = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "yuekbox-assembly-test-"))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const noNetwork = async (): Promise<Response> => {
  throw new Error("no network in tests")
}

test("a stubbed bare-home run reaches ready, and the second run skips the built pieces", async () => {
  await withTempDir(async (home) => {
    const firstCommands: string[][] = []
    const firstRun: ProcessRunner = async (command) => {
      firstCommands.push([...command])
      if (command[0] === "nvidia-smi") {
        return { exitCode: 0, stdout: "616.56\n", stderrTail: "" }
      }
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const first = assembleProvisioningSlice({
      home,
      findExecutable: () => "/tools/uv",
      fetchImpl: noNetwork,
      runProcess: firstRun,
    })

    const firstResult = await first.provisionAll({ home })

    expect(firstResult.ok).toBe(true)
    if (!firstResult.ok) return
    expect(firstResult.value.steps.map((step) => `${step.step}:${step.status}`)).toEqual([
      "uv:completed",
      "python:completed",
      "gpu:completed",
      "yue2:completed",
      "sheetsage2:completed",
      "lyricalign:completed",
      "scripts:completed",
    ])
    expect(firstCommands.filter((command) => command[0] === "nvidia-smi")).toHaveLength(1)
    for (const name of ["yue2", "sheetsage2", "lyricalign"]) {
      expect(existsSync(join(home, "venvs", name, ".yuekbox.json"))).toBe(true)
    }
    expect(existsSync(join(home, "tools", "python", ".yuekbox-3.12.3.json"))).toBe(true)
    expect(existsSync(join(home, "tools", "python", ".yuekbox-3.11.14.json"))).toBe(true)
    expect(existsSync(join(home, "scripts", "generate.py"))).toBe(true)

    const secondCommands: string[][] = []
    const secondRun: ProcessRunner = async (command: readonly string[]) => {
      secondCommands.push([...command])
      if (command[0] === "nvidia-smi") {
        return { exitCode: 0, stdout: "616.56\n", stderrTail: "" }
      }
      throw new Error(`the second run should not spawn: ${command.join(" ")}`)
    }
    const second = assembleProvisioningSlice({
      home,
      findExecutable: () => "/tools/uv",
      fetchImpl: noNetwork,
      runProcess: secondRun,
    })

    const secondResult = await second.provisionAll({ home })

    expect(secondResult.ok).toBe(true)
    if (!secondResult.ok) return
    expect(secondResult.value.steps.map((step) => `${step.step}:${step.status}`)).toEqual([
      "uv:completed",
      "python:skipped",
      "gpu:completed",
      "yue2:skipped",
      "sheetsage2:skipped",
      "lyricalign:skipped",
      "scripts:completed",
    ])
    expect(secondCommands).toEqual([
      ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
    ])
  })
})

test("a machine with no NVIDIA driver stops before building any environment", async () => {
  await withTempDir(async (home) => {
    const slice = assembleProvisioningSlice({
      home,
      findExecutable: () => "/tools/uv",
      fetchImpl: noNetwork,
      runProcess: async (command) => {
        if (command[0] === "nvidia-smi") {
          throw new Error("spawn nvidia-smi ENOENT")
        }
        return { exitCode: 0, stdout: "", stderrTail: "" }
      },
    })

    const result = await slice.provisionAll({ home })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.step).toBe("gpu")
    expect(result.error.kind).toBe("gpu_missing")
    expect(existsSync(join(home, "venvs", "yue2"))).toBe(false)
  })
})
