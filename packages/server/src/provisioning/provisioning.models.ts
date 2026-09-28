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
export type ProvisionStepId = "uv" | "python" | "gpu" | "environment" | "align" | "scripts"

/**
 * Plain-English names for each step. They surface in progress output and in
 * failure messages, so they never name implementation details. The one
 * `environment` step carries the song generator and reference transcription,
 * so its label covers both. `align` is the lyric-timing environment; Linux
 * shares its one environment, so there the step reports skipped.
 */
export const provisionStepLabels: Readonly<Record<ProvisionStepId, string>> = Object.freeze({
  uv: "Setting up yuekbox tools",
  python: "Installing the song engine",
  gpu: "Checking the graphics card",
  environment: "Installing the song tools",
  align: "Installing the lyric timing tools",
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
  | "gpu_memory_low"
  | "macos_too_old"
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
  /** Present on `gpu_memory_low` and `macos_too_old`, for the message. */
  foundAmount?: string
  minimumAmount?: string
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

/**
 * How uv searches the package indexes. The one supported rule considers every
 * version on both trusted indexes instead of stopping at the first index that
 * carries a package.
 */
export type IndexStrategy = "unsafe-best-match"

export type VenvRequest = Readonly<{
  name: string
  dir: string
  pythonVersion: string
  indexUrl: string
  /** The priority index, or null when the one index is all the pin needs. */
  extraIndexUrl: string | null
  indexStrategy: IndexStrategy
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
 * What the machine probe found. `nvidia` means nvidia-smi answered with a
 * driver version (the Linux path); `apple-silicon` means the Mac probe read
 * its unified memory and macOS version; `absent` folds in "no usable GPU",
 * a wrong architecture, and a failed probe alike.
 */
export type GpuFacts =
  | Readonly<{ kind: "nvidia"; driverVersion: string }>
  | Readonly<{ kind: "apple-silicon"; memoryBytes: number; macosVersion: string }>
  | Readonly<{ kind: "absent"; detail: string }>

export type GpuError = Readonly<{
  kind: "gpu_missing" | "gpu_driver_too_old" | "gpu_unreadable" | "gpu_memory_low" | "macos_too_old"
  detail: string
  foundDriverVersion?: string
  minimumDriverVersion?: string
  foundAmount?: string
  minimumAmount?: string
}>

/** The CUDA 12 build the Linux pins need, and the driver floor that runs it. */
export type TorchRequirement = Readonly<{
  cudaFamily: "12.x"
  indexUrl: string
  minimumDriverVersion: string
}>

/** The Apple Silicon envelope the macOS runtime runs inside. */
export type MacRequirement = Readonly<{
  /** The sampled memory budget the MLX runtime enforces while generating. */
  memoryBudgetGiB: number
}>

/**
 * What the machine check decided. `cuda` carries the wheel index the Linux
 * environment installs against; `mlx` says the Mac satisfies the runtime's
 * floor and its environments need no extra index.
 */
export type MachineRequirement =
  | Readonly<{ kind: "cuda"; indexUrl: string }>
  | Readonly<{ kind: "mlx"; memoryBudgetGiB: number }>

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
