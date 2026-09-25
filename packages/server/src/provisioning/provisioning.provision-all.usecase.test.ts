import { expect, test } from "bun:test"
import { join } from "node:path"
import { err, ok } from "../shared/result"
import { ProvisionProgress, UvTool, VenvRequest } from "./provisioning.models"
import { venvPins } from "./provisioning.packages"
import {
  EnsurePython,
  EnsureUv,
  EnsureVenv,
  InstallScripts,
  ReadGpuFacts,
} from "./provisioning.ports"
import { makeProvisionAll } from "./provisioning.provision-all.usecase"

const home = "/home/u/.yuekbox"
const uvTool: UvTool = { path: "/usr/local/bin/uv", source: "system" }
const gpuOk: ReadGpuFacts = async () => ({ kind: "nvidia", driverVersion: "616.56" })

type Stubs = Readonly<{
  ensureUv?: EnsureUv
  ensurePython?: EnsurePython
  readGpuFacts?: ReadGpuFacts
  ensureVenv?: EnsureVenv
  installScripts?: InstallScripts
}>

type Harness = Readonly<{
  calls: string[]
  venvs: VenvRequest[]
  scriptDirs: string[]
  progress: ProvisionProgress[]
  provisionAll: ReturnType<typeof makeProvisionAll>
}>

const harness = (stubs: Stubs = {}): Harness => {
  const calls: string[] = []
  const venvs: VenvRequest[] = []
  const scriptDirs: string[] = []
  const progress: ProvisionProgress[] = []

  const provisionAll = makeProvisionAll({
    ensureUv:
      stubs.ensureUv ??
      (async () => {
        calls.push("uv")
        return ok(uvTool)
      }),
    ensurePython:
      stubs.ensurePython ??
      (async () => {
        calls.push("python")
        return ok({ status: "installed" })
      }),
    readGpuFacts:
      stubs.readGpuFacts ??
      (async () => {
        calls.push("gpu")
        return gpuOk()
      }),
    ensureVenv:
      stubs.ensureVenv ??
      (async (_uv, request) => {
        calls.push(request.name)
        venvs.push(request)
        return ok({ status: "installed" })
      }),
    installScripts:
      stubs.installScripts ??
      (async (dir) => {
        calls.push("scripts")
        scriptDirs.push(dir)
        return ok({ scriptsDir: dir, files: Object.freeze(["generate.py"]) })
      }),
  })

  return { calls, venvs, scriptDirs, progress, provisionAll }
}

const run = async (state: Harness) =>
  state.provisionAll({ home, onProgress: (event) => state.progress.push(event) })

test("runs every piece in order and reports one completed step each", async () => {
  const state = harness()

  const result = await run(state)

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(state.calls).toEqual([
    "uv",
    "python",
    "gpu",
    "yue2",
    "sheetsage2",
    "lyricalign",
    "scripts",
  ])
  expect(result.value.home).toBe(home)
  expect(result.value.steps.map((step) => step.step)).toEqual([
    "uv",
    "python",
    "gpu",
    "yue2",
    "sheetsage2",
    "lyricalign",
    "scripts",
  ])
  expect(result.value.steps.every((step) => step.status === "completed")).toBe(true)
})

test("emits a started event before each piece and a final status after it", async () => {
  const state = harness()

  await run(state)

  expect(state.progress.map((event) => `${event.step}:${event.status}`)).toEqual([
    "uv:started",
    "uv:completed",
    "python:started",
    "python:completed",
    "gpu:started",
    "gpu:completed",
    "yue2:started",
    "yue2:completed",
    "sheetsage2:started",
    "sheetsage2:completed",
    "lyricalign:started",
    "lyricalign:completed",
    "scripts:started",
    "scripts:completed",
  ])
  expect(state.progress[0]?.label).toBe("Setting up yuekbox tools")
  expect(state.progress[1]?.label).toBe("Setting up yuekbox tools")
})

test("builds one venv per piece under <home>/venvs with the manifest pins", async () => {
  const state = harness()

  await run(state)

  expect(state.venvs.map((request) => request.dir)).toEqual([
    join(home, "venvs/yue2"),
    join(home, "venvs/sheetsage2"),
    join(home, "venvs/lyricalign"),
  ])
  for (const request of state.venvs) {
    const pin = venvPins[request.name as keyof typeof venvPins]
    if (pin === undefined) throw new Error(`missing pin for ${request.name}`)
    expect(request.pythonVersion).toBe(pin.python)
    expect(request.packages).toEqual(pin.packages)
    expect(request.extraIndexUrl).toBe(pin.extraIndexUrl)
    expect(request.fingerprint.length).toBeGreaterThan(0)
  }
  expect(state.venvs[0]?.indexUrl).toBe("https://download.pytorch.org/whl/cu128")
  expect(state.venvs[1]?.indexUrl).toBe("https://download.pytorch.org/whl/cu126")
  expect(state.scriptDirs).toEqual([join(home, "scripts")])
})

test("a uv failure stops the run before anything else", async () => {
  const state = harness({
    ensureUv: async () => err({ kind: "uv_unavailable", detail: "download failed" }),
  })

  const result = await run(state)

  expect(result).toEqual({
    ok: false,
    error: {
      step: "uv",
      label: "Setting up yuekbox tools",
      kind: "uv_unavailable",
      detail: "download failed",
    },
  })
  expect(state.calls).toEqual([])
  expect(state.progress.map((event) => `${event.step}:${event.status}`)).toEqual([
    "uv:started",
    "uv:failed",
  ])
})

test("a graphics failure stops the run before any venv is built", async () => {
  const state = harness({
    readGpuFacts: async () => ({ kind: "nvidia", driverVersion: "470.82" }),
  })

  const result = await run(state)

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.step).toBe("gpu")
  expect(result.error.kind).toBe("gpu_driver_too_old")
  expect(result.error.foundDriverVersion).toBe("470.82")
  expect(result.error.minimumDriverVersion).toBe("525.60.13")
  expect(state.calls).toEqual(["uv", "python"])
})

test("a venv failure names its own piece and stops the later pieces", async () => {
  const state = harness({
    ensureVenv: async (_uv, request) =>
      request.name === "sheetsage2"
        ? err({ kind: "venv_failed", detail: "uv exited 2" })
        : ok({ status: "installed" }),
  })

  const result = await run(state)

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error).toEqual({
    step: "sheetsage2",
    label: "Installing reference transcription",
    kind: "venv_failed",
    detail: "uv exited 2",
  })
  expect(state.progress.at(-1)).toEqual({
    step: "sheetsage2",
    label: "Installing reference transcription",
    status: "failed",
  })
})

test("a script failure surfaces as the scripts piece", async () => {
  const state = harness({
    installScripts: async () => err({ kind: "install_scripts_failed", detail: "missing tool" }),
  })

  const result = await run(state)

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("scripts_failed")
  expect(result.error.step).toBe("scripts")
  expect(result.error.detail).toBe("missing tool")
})

test("completed pieces report skipped on a rerun", async () => {
  const state = harness({
    ensureUv: async () => ok({ path: "/usr/local/bin/uv", source: "system" }),
    ensurePython: async () => ok({ status: "ready" }),
    ensureVenv: async (_uv, request) => {
      state.venvs.push(request)
      return ok({ status: "ready" })
    },
  })

  const result = await run(state)

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.steps.map((step) => `${step.step}:${step.status}`)).toEqual([
    "uv:completed",
    "python:skipped",
    "gpu:completed",
    "yue2:skipped",
    "sheetsage2:skipped",
    "lyricalign:skipped",
    "scripts:completed",
  ])
  expect(state.progress.filter((event) => event.status === "skipped")).toHaveLength(4)
})

test("the return type carries the same steps as the progress stream", async () => {
  const state = harness()
  const result = await run(state)

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.steps.map((step) => step.label)).toEqual(
    state.progress.filter((event) => event.status !== "started").map((event) => event.label),
  )
})
