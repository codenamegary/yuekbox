import { expect, test } from "bun:test"
import { ProcessRunner } from "../shared/process"
import {
  gpuDriverQuery,
  makeReadGpuFacts,
  parseDriverVersion,
  parseMacMachine,
  parseMacosVersion,
  parseMemsizeBytes,
} from "./provisioning.gpu.adapters"

test("parses one driver version per line and takes the first", () => {
  expect(parseDriverVersion("616.56\n")).toBe("616.56")
  expect(parseDriverVersion(" 616.56 \n")).toBe("616.56")
  expect(parseDriverVersion("616.56\n616.56\n")).toBe("616.56")
  expect(parseDriverVersion("525.60.13.1\n")).toBe("525.60.13.1")
  expect(parseDriverVersion("")).toBeNull()
  expect(parseDriverVersion("driver: 616.56")).toBeNull()
  expect(parseDriverVersion("not-a-version")).toBeNull()
})

test("reports the driver version nvidia-smi answers with", async () => {
  const commands: string[][] = []
  const runProcess: ProcessRunner = async (command) => {
    commands.push([...command])
    return { exitCode: 0, stdout: "616.56\n", stderrTail: "" }
  }

  const facts = await makeReadGpuFacts({ cwd: "/home/u/.yuekbox", runProcess, platform: "linux" })()

  expect(facts).toEqual({ kind: "nvidia", driverVersion: "616.56" })
  expect(commands).toEqual([["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"]])
  expect(gpuDriverQuery).toEqual([
    "nvidia-smi",
    "--query-gpu=driver_version",
    "--format=csv,noheader",
  ])
})

test("a nonzero exit means no usable driver", async () => {
  const runProcess: ProcessRunner = async () => ({
    exitCode: 9,
    stdout: "",
    stderrTail: "NVIDIA-SMI has failed because it couldn't communicate with the driver",
  })

  const facts = await makeReadGpuFacts({ cwd: "/tmp", runProcess, platform: "linux" })()

  expect(facts.kind).toBe("absent")
  if (facts.kind !== "absent") return
  expect(facts.detail).toContain("NVIDIA-SMI has failed")
})

test("a missing nvidia-smi is caught, not thrown", async () => {
  const runProcess: ProcessRunner = async () => {
    throw new Error("spawn nvidia-smi ENOENT")
  }

  const facts = await makeReadGpuFacts({ cwd: "/tmp", runProcess, platform: "linux" })()

  expect(facts.kind).toBe("absent")
  if (facts.kind !== "absent") return
  expect(facts.detail).toContain("nvidia-smi")
})

test("an empty answer means no driver", async () => {
  const runProcess: ProcessRunner = async () => ({ exitCode: 0, stdout: "\n", stderrTail: "" })

  const facts = await makeReadGpuFacts({ cwd: "/tmp", runProcess, platform: "linux" })()

  expect(facts.kind).toBe("absent")
  if (facts.kind !== "absent") return
  expect(facts.detail).toContain("no driver")
})

test("mac probes read the architecture, memory, and macOS version", async () => {
  const commands: string[][] = []
  const runProcess: ProcessRunner = async (command) => {
    commands.push([...command])
    const stdout =
      command[2] === "hw.memsize"
        ? "68719476736\n"
        : command[0] === "sw_vers"
          ? "15.5\n"
          : "arm64\n"
    return { exitCode: 0, stdout, stderrTail: "" }
  }

  const facts = await makeReadGpuFacts({ cwd: "/tmp", runProcess, platform: "macos" })()

  expect(facts).toEqual({ kind: "apple-silicon", memoryBytes: 68719476736, macosVersion: "15.5" })
  expect(commands).toEqual([
    ["sysctl", "-n", "hw.machine"],
    ["sysctl", "-n", "hw.memsize"],
    ["sw_vers", "-productVersion"],
  ])
})

test("an Intel Mac is absent, not Apple Silicon", async () => {
  const runProcess: ProcessRunner = async (command) => ({
    exitCode: 0,
    stdout: command[2] === "hw.memsize" ? "17179869184\n" : "x86_64\n",
    stderrTail: "",
  })

  const facts = await makeReadGpuFacts({ cwd: "/tmp", runProcess, platform: "macos" })()

  expect(facts.kind).toBe("absent")
  if (facts.kind !== "absent") return
  expect(facts.detail).toContain("x86_64")
})

test("a failed mac probe is caught and becomes absent", async () => {
  const runProcess: ProcessRunner = async () => {
    throw new Error("spawn sysctl ENOENT")
  }

  const facts = await makeReadGpuFacts({ cwd: "/tmp", runProcess, platform: "macos" })()

  expect(facts.kind).toBe("absent")
  if (facts.kind !== "absent") return
  expect(facts.detail).toContain("sysctl")
})

test("mac probe answers are validated before they become facts", () => {
  expect(parseMacMachine("arm64\n")).toBe("arm64")
  expect(parseMacMachine("x86_64\n")).toBe("x86_64")
  expect(parseMacMachine("")).toBeNull()

  expect(parseMemsizeBytes("68719476736\n")).toBe(68719476736)
  expect(parseMemsizeBytes("not-a-number\n")).toBeNull()
  expect(parseMemsizeBytes("0\n")).toBeNull()

  expect(parseMacosVersion("15.5\n")).toBe("15.5")
  expect(parseMacosVersion("15.5 (24E248)\n")).toBeNull()
  expect(parseMacosVersion("")).toBeNull()
})
