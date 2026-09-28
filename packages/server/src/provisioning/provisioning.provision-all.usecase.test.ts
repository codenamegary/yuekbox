import { expect, test } from "bun:test"
import { join } from "node:path"
import { err, ok } from "../shared/result"
import { ProvisionProgress, UvTool, VenvRequest } from "./provisioning.models"
import {
  pypiIndexUrl,
  torchWheelIndexUrl,
  uvPinFor,
  venvFingerprint,
  venvPinsFor,
} from "./provisioning.packages"
import {
  EnsurePython,
  EnsureUv,
  EnsureVenv,
  InstallScripts,
  ReadGpuFacts,
} from "./provisioning.ports"
import { makeProvisionAll } from "./provisioning.provision-all.usecase"

const home = "/home/u/.yuekbox"
const uvTool: UvTool = { path: "/usr/local/bin/uv" }
const gpuOk: ReadGpuFacts = async () => ({ kind: "nvidia", driverVersion: "616.56" })
const macOk: ReadGpuFacts = async () => ({
  kind: "apple-silicon",
  memoryBytes: 36 * 1024 ** 3,
  macosVersion: "15.5",
})

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
        calls.push(`venv:${request.name}`)
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

const run = async (state: Harness, platform: "linux" | "macos" = "linux") =>
  state.provisionAll({ home, platform, onProgress: (event) => state.progress.push(event) })

test("runs every piece in order and reports one completed step each", async () => {
  const state = harness()

  const result = await run(state)

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(state.calls).toEqual(["uv", "python", "gpu", "venv:python", "scripts"])
  expect(result.value.home).toBe(home)
  expect(result.value.steps.map((step) => `${step.step}:${step.status}`)).toEqual([
    "uv:completed",
    "python:completed",
    "gpu:completed",
    "environment:completed",
    "align:skipped",
    "scripts:completed",
  ])
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
    "environment:started",
    "environment:completed",
    "align:started",
    "align:skipped",
    "scripts:started",
    "scripts:completed",
  ])
  expect(state.progress[0]?.label).toBe("Setting up yuekbox tools")
})

test("installer output streams through the progress channel as it arrives", async () => {
  let arrivedDuringCall = 0 // structure: allow-let
  const state = harness({
    ensurePython: async (_uv, _versions, onOutput) => {
      onOutput?.("Downloading cpython-3.12.3+20240116")
      return ok({ status: "installed" })
    },
    ensureVenv: async (_uv, _request, onOutput) => {
      onOutput?.("Resolved 40 packages in 1.2s")
      arrivedDuringCall = state.progress.filter((event) => event.detail !== undefined).length
      return ok({ status: "installed" })
    },
  })

  await run(state)

  const activity = state.progress.filter((event) => event.detail !== undefined)
  expect(activity).toEqual([
    {
      step: "python",
      label: "Installing the song engine",
      status: "started",
      detail: "Downloading cpython-3.12.3+20240116",
    },
    {
      step: "environment",
      label: "Installing the song tools",
      status: "started",
      detail: "Resolved 40 packages in 1.2s",
    },
  ])
  // Both events were on the channel before the second step resolved.
  expect(arrivedDuringCall).toBe(2)
})

test("builds exactly one shared venv under <home>/venvs with the manifest pin", async () => {
  const state = harness()

  await run(state)

  const request = state.venvs[0]
  if (request === undefined) throw new Error("no venv request")
  const [pin] = venvPinsFor("linux", torchWheelIndexUrl)
  if (pin === undefined) throw new Error("no linux pin")
  expect(request.dir).toBe(join(home, "venvs/python"))
  expect(request.name).toBe(pin.name)
  expect(request.pythonVersion).toBe(pin.python)
  expect(request.packages).toEqual(pin.packages)
  expect(request.indexUrl).toBe(pypiIndexUrl)
  expect(request.extraIndexUrl).toBe(torchWheelIndexUrl)
  expect(request.indexStrategy).toBe(pin.indexStrategy)
  expect(request.fingerprint.length).toBeGreaterThan(0)
  expect(request.fingerprint).toBe(venvFingerprint({ ...pin, extraIndexUrl: torchWheelIndexUrl }))
  expect(state.scriptDirs).toEqual([join(home, "scripts")])
})

test("macOS builds the MLX environment and the align environment, in order", async () => {
  const state = harness({ readGpuFacts: macOk })

  const result = await run(state, "macos")

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.steps.map((step) => `${step.step}:${step.status}`)).toEqual([
    "uv:completed",
    "python:completed",
    "gpu:completed",
    "environment:completed",
    "align:completed",
    "scripts:completed",
  ])
  expect(state.venvs).toHaveLength(2)

  const generation = state.venvs[0]
  const align = state.venvs[1]
  if (generation === undefined || align === undefined) throw new Error("missing venv requests")
  const [generationPin, alignPin] = venvPinsFor("macos", null)
  if (generationPin === undefined || alignPin === undefined) throw new Error("missing mac pins")

  expect(generation.dir).toBe(join(home, "venvs/python"))
  expect(generation.name).toBe(generationPin.name)
  expect(generation.packages).toEqual(generationPin.packages)
  expect(generation.extraIndexUrl).toBeNull()
  expect(generation.fingerprint).toBe(venvFingerprint(generationPin))

  expect(align.dir).toBe(join(home, "venvs/align"))
  expect(align.name).toBe(alignPin.name)
  expect(align.packages).toEqual(alignPin.packages)
  expect(align.extraIndexUrl).toBeNull()
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

test("a Mac below the memory floor stops before any venv is built", async () => {
  const state = harness({
    readGpuFacts: async () => ({
      kind: "apple-silicon",
      memoryBytes: 8 * 1024 ** 3,
      macosVersion: "15.5",
    }),
  })

  const result = await run(state, "macos")

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.step).toBe("gpu")
  expect(result.error.kind).toBe("gpu_memory_low")
  expect(result.error.foundAmount).toBe("8 GiB")
  expect(result.error.minimumAmount).toBe("16 GiB")
  expect(state.venvs).toHaveLength(0)
})

test("a venv failure names the shared environment and stops the later pieces", async () => {
  const state = harness({
    ensureVenv: async () => err({ kind: "venv_failed", detail: "uv exited 2" }),
  })

  const result = await run(state)

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error).toEqual({
    step: "environment",
    label: "Installing the song tools",
    kind: "venv_failed",
    detail: "uv exited 2",
  })
  expect(state.progress.at(-1)).toEqual({
    step: "environment",
    label: "Installing the song tools",
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
    ensureUv: async () => ok({ path: "/usr/local/bin/uv" }),
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
    "environment:skipped",
    "align:skipped",
    "scripts:completed",
  ])
  expect(state.progress.filter((event) => event.status === "skipped")).toHaveLength(3)
})

test("the uv pin the run fetched matches the platform's archive", async () => {
  expect(uvPinFor("linux").target).toBe("x86_64-unknown-linux-gnu")
  expect(uvPinFor("macos").target).toBe("aarch64-apple-darwin")
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
