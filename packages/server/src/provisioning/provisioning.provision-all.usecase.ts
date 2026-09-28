import { HostPlatform } from "../shared/platform"
import { alignVenvPath, homeLayout, venvPath } from "../shared/home"
import { err, ok } from "../shared/result"
import { evaluateMachine } from "./provisioning.gpu"
import {
  ProvisionFailure,
  ProvisionStepId,
  ProvisionStepOutcome,
  ProvisionStepStatus,
  provisionStepLabels,
} from "./provisioning.models"
import { managedPythonVersions, venvFingerprint, venvPinsFor } from "./provisioning.packages"
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

/**
 * Every piece the app needs, built in order into the home. Each port skips
 * its own completed work and says so, so a rerun resumes instead of redoing:
 * uv (PATH or the pinned fetch), the managed interpreter, the machine check
 * that picks the platform's wheels, the environment(s) every Python pass
 * runs in, and our installed entrypoints. The first failure stops the run
 * and names its piece.
 *
 * The platform decides the shape of the work: Linux checks the NVIDIA
 * driver and builds one shared environment against the CUDA wheel index it
 * picked; macOS checks Apple Silicon and its memory floor, then builds two
 * environments — the Torch-free MLX runtime, and the torch-based aligner.
 */
export const makeProvisionAll =
  (deps: ProvisioningDeps): ProvisionAll =>
  async (input) => {
    const platform: HostPlatform = input.platform
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
    const machine = evaluateMachine(await deps.readGpuFacts())
    if (!machine.ok) return err(stop("gpu", machine.error))
    finish("gpu", "completed")

    // The machine check picks the CUDA wheel index on Linux; the stamp and
    // the install command both derive from the same pin so they can never
    // disagree. macOS's pins carry their own single index.
    const torchIndexUrl = machine.value.kind === "cuda" ? machine.value.indexUrl : null
    const [environmentPin, alignPin] = venvPinsFor(platform, torchIndexUrl)

    emit("environment", "started")
    if (environmentPin === undefined) return err(stop("environment", { kind: "venv_failed", detail: "no environment pin" }))
    const built = await deps.ensureVenv(uv.value, {
      name: environmentPin.name,
      dir: venvPath(input.home),
      pythonVersion: environmentPin.python,
      indexUrl: environmentPin.indexUrl,
      extraIndexUrl: environmentPin.extraIndexUrl,
      indexStrategy: environmentPin.indexStrategy,
      packages: environmentPin.packages,
      fingerprint: venvFingerprint(environmentPin),
    })
    if (!built.ok) {
      return err(stop("environment", { kind: built.error.kind, detail: built.error.detail }))
    }
    finish("environment", built.value.status === "installed" ? "completed" : "skipped")

    emit("align", "started")
    if (alignPin === undefined) {
      // Linux: the one shared environment already carries the aligner.
      finish("align", "skipped")
    } else {
      const alignDir = alignVenvPath(input.home)
      const alignBuilt = await deps.ensureVenv(uv.value, {
        name: alignPin.name,
        dir: alignDir,
        pythonVersion: alignPin.python,
        indexUrl: alignPin.indexUrl,
        extraIndexUrl: alignPin.extraIndexUrl,
        indexStrategy: alignPin.indexStrategy,
        packages: alignPin.packages,
        fingerprint: venvFingerprint(alignPin),
      })
      if (!alignBuilt.ok) {
        return err(stop("align", { kind: alignBuilt.error.kind, detail: alignBuilt.error.detail }))
      }
      finish("align", alignBuilt.value.status === "installed" ? "completed" : "skipped")
    }

    emit("scripts", "started")
    const scripts = await deps.installScripts(layout.scripts)
    if (!scripts.ok) {
      return err(stop("scripts", { kind: "scripts_failed", detail: scripts.error.detail }))
    }
    finish("scripts", "completed")

    return ok(Object.freeze({ home: input.home, steps: Object.freeze(steps) }))
  }
