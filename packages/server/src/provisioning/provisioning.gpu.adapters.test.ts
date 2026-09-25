import { expect, test } from "bun:test"
import { ProcessRunner } from "../shared/process"
import { gpuDriverQuery, makeReadGpuFacts, parseDriverVersion } from "./provisioning.gpu.adapters"

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

  const facts = await makeReadGpuFacts({ cwd: "/home/u/.yuekbox", runProcess })()

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

  const facts = await makeReadGpuFacts({ cwd: "/tmp", runProcess })()

  expect(facts.kind).toBe("absent")
  if (facts.kind !== "absent") return
  expect(facts.detail).toContain("NVIDIA-SMI has failed")
})

test("a missing nvidia-smi is caught, not thrown", async () => {
  const runProcess: ProcessRunner = async () => {
    throw new Error("spawn nvidia-smi ENOENT")
  }

  const facts = await makeReadGpuFacts({ cwd: "/tmp", runProcess })()

  expect(facts.kind).toBe("absent")
  if (facts.kind !== "absent") return
  expect(facts.detail).toContain("nvidia-smi")
})

test("an empty answer means no driver", async () => {
  const runProcess: ProcessRunner = async () => ({ exitCode: 0, stdout: "\n", stderrTail: "" })

  const facts = await makeReadGpuFacts({ cwd: "/tmp", runProcess })()

  expect(facts.kind).toBe("absent")
  if (facts.kind !== "absent") return
  expect(facts.detail).toContain("no driver")
})
