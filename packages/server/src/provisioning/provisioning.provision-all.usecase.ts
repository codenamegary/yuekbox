import { homeLayout, venvPath } from "../shared/home"
import { err, ok, Result } from "../shared/result"
import { evaluateGpu } from "./provisioning.gpu"
import {
  ProvisionFailure,
  ProvisionStepId,
  ProvisionStepOutcome,
  ProvisionStepStatus,
  provisionStepLabels,
  UvTool,
} from "./provisioning.models"
import { managedPythonVersions, venvFingerprint, venvPins } from "./provisioning.packages"
import {
  EnsurePython,
  EnsureUv,
  EnsureVenv,
  InstallScripts,
  ProvisionAll,
  ReadGpuFacts,
} from "./provisioning.ports"

export type ProvisioningDeps = Readonly<{
  ensureUv: EnsureUv
  ensurePython: EnsurePython
  readGpuFacts: ReadGpuFacts
  ensureVenv: EnsureVenv
  installScripts: InstallScripts
}>

const venvSteps = ["yue2", "sheetsage2", "lyricalign"] as const

/**
 * Every piece the app needs, built in order into the home. Each port skips
 * its own completed work and says so, so a rerun resumes instead of redoing:
 * uv (PATH or the pinned fetch), the managed interpreters, the CUDA check
 * that picks the torch wheels, the three pinned environments, and our
 * installed entrypoints. The first failure stops the run and names its piece.
 */
export const makeProvisionAll =
  (deps: ProvisioningDeps): ProvisionAll =>
  async (input) => {
    const layout = homeLayout(input.home)
    const steps: ProvisionStepOutcome[] = []

    const emit = (step: ProvisionStepId, status: ProvisionStepStatus) => {
      input.onProgress?.({ step, label: provisionStepLabels[step], status })
    }

    const stop = (
      step: ProvisionStepId,
      failure: Omit<ProvisionFailure, "step" | "label">,
    ): ProvisionFailure => {
      emit(step, "failed")
      return { step, label: provisionStepLabels[step], ...failure }
    }

    const finish = (step: ProvisionStepId, status: "completed" | "skipped") => {
      steps.push({ step, label: provisionStepLabels[step], status })
      emit(step, status)
    }

    emit("uv", "started")
    const uv = await deps.ensureUv()
    if (!uv.ok) return err(stop("uv", { kind: uv.error.kind, detail: uv.error.detail }))
    finish("uv", "completed")

    emit("python", "started")
    const python = await deps.ensurePython(uv.value, managedPythonVersions)
    if (!python.ok) {
      return err(stop("python", { kind: python.error.kind, detail: python.error.detail }))
    }
    finish("python", python.value.status === "installed" ? "completed" : "skipped")

    emit("gpu", "started")
    const gpu = evaluateGpu(await deps.readGpuFacts())
    if (!gpu.ok) return err(stop("gpu", gpu.error))
    finish("gpu", "completed")

    const buildVenv = async (
      step: (typeof venvSteps)[number],
      uvTool: UvTool,
      indexUrl: string,
    ): Promise<Result<ProvisionStepOutcome, ProvisionFailure>> => {
      const pin = venvPins[step]
      const built = await deps.ensureVenv(uvTool, {
        name: pin.name,
        dir: venvPath(input.home, pin.name),
        pythonVersion: pin.python,
        indexUrl,
        extraIndexUrl: pin.extraIndexUrl,
        packages: pin.packages,
        fingerprint: venvFingerprint(pin),
      })
      if (!built.ok) {
        emit(step, "failed")
        return err({
          step,
          label: provisionStepLabels[step],
          kind: built.error.kind,
          detail: built.error.detail,
        })
      }
      return ok({
        step,
        label: provisionStepLabels[step],
        status: built.value.status === "installed" ? "completed" : "skipped",
      })
    }

    for (const step of venvSteps) {
      emit(step, "started")
      const built = await buildVenv(
        step,
        uv.value,
        step === "yue2" ? gpu.value.indexUrl : venvPins[step].indexUrl,
      )
      if (!built.ok) return built
      finish(built.value.step, built.value.status)
    }

    emit("scripts", "started")
    const scripts = await deps.installScripts(layout.scripts)
    if (!scripts.ok) {
      return err(stop("scripts", { kind: "scripts_failed", detail: scripts.error.detail }))
    }
    finish("scripts", "completed")

    return ok(Object.freeze({ home: input.home, steps: Object.freeze(steps) }))
  }
