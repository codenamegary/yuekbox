/** The tools the installer wrote into the home, flattened, in manifest order. */
export type InstalledScripts = Readonly<{
  scriptsDir: string
  files: readonly string[]
}>

export type InstallScriptsError = Readonly<{
  kind: "install_scripts_failed"
  detail: string
}>

/** The pieces provisioning installs, in the order it installs them. */
export type ProvisionStepId = "uv" | "python" | "gpu" | "environment" | "scripts"

/**
 * Plain-English names for each step. They surface in progress output and in
 * failure messages, so they never name implementation details. The one
 * `environment` step carries the song generator, reference transcription,
 * and lyric timing, so its label covers all three.
 */
export const provisionStepLabels: Readonly<Record<ProvisionStepId, string>> = Object.freeze({
  uv: "Setting up yuekbox tools",
  python: "Installing the song engine",
  gpu: "Checking the graphics card",
  environment: "Installing the song tools",
  scripts: "Installing helper programs",
})

export type ProvisionStepStatus = "started" | "completed" | "skipped" | "failed"

export type ProvisionProgress = Readonly<{
  step: ProvisionStepId
  label: string
  status: ProvisionStepStatus
}>

export type ProvisionStepOutcome = Readonly<{
  step: ProvisionStepId
  label: string
  status: "completed" | "skipped"
}>

export type ProvisionFailureKind =
  | "uv_unavailable"
  | "python_unavailable"
  | "gpu_missing"
  | "gpu_driver_too_old"
  | "gpu_unreadable"
  | "venv_failed"
  | "scripts_failed"

/**
 * A provisioning stop. `detail` is internal diagnostics for logs and tests;
 * the user sees the plain-English mapping from provisioning.messages.ts.
 */
export type ProvisionFailure = Readonly<{
  step: ProvisionStepId
  label: string
  kind: ProvisionFailureKind
  detail: string
  /** Present on `gpu_driver_too_old`, for the plain-English message. */
  foundDriverVersion?: string
  minimumDriverVersion?: string
}>

export type ProvisionReport = Readonly<{
  home: string
  steps: readonly ProvisionStepOutcome[]
}>

/** The uv binary provisioning runs: the pinned, managed copy we fetched. */
export type UvTool = Readonly<{
  path: string
}>

export type UvFailure = Readonly<{
  kind: "uv_unavailable"
  detail: string
}>

export type PythonState = Readonly<{
  status: "ready" | "installed"
}>

export type PythonFailure = Readonly<{
  kind: "python_unavailable"
  detail: string
}>

export type VenvRequest = Readonly<{
  name: string
  dir: string
  pythonVersion: string
  indexUrl: string
  extraIndexUrl: string
  packages: readonly string[]
  /** Identity of the pinned set; a matching stamp means the venv is current. */
  fingerprint: string
}>

export type VenvState = Readonly<{
  status: "ready" | "installed"
}>

export type VenvFailure = Readonly<{
  kind: "venv_failed"
  detail: string
}>

/**
 * What the driver probe found. `nvidia` means nvidia-smi answered with a
 * driver version; `absent` folds in "no GPU", "no driver", and "no nvidia-smi".
 */
export type GpuFacts =
  | Readonly<{ kind: "nvidia"; driverVersion: string }>
  | Readonly<{ kind: "absent"; detail: string }>

export type GpuError = Readonly<{
  kind: "gpu_missing" | "gpu_driver_too_old" | "gpu_unreadable"
  detail: string
  foundDriverVersion?: string
  minimumDriverVersion?: string
}>

/** The CUDA 12 build the pins need, and the driver floor that runs it. */
export type TorchRequirement = Readonly<{
  cudaFamily: "12.x"
  indexUrl: string
  minimumDriverVersion: string
}>

export type DownloadRequest = Readonly<{
  url: string
  destPath: string
  sha256: string
}>

export type DownloadedFile = Readonly<{
  path: string
  bytes: number
}>

export type DownloadFailure = Readonly<{
  kind: "download_failed" | "checksum_mismatch"
  detail: string
}>
