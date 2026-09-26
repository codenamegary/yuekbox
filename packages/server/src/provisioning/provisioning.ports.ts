import { Result } from "../shared/result"
import {
  DownloadedFile,
  DownloadFailure,
  DownloadRequest,
  GpuFacts,
  InstalledScripts,
  InstallScriptsError,
  ProvisionFailure,
  ProvisionProgress,
  ProvisionReport,
  PythonFailure,
  PythonState,
  UvFailure,
  UvTool,
  VenvFailure,
  VenvRequest,
  VenvState,
} from "./provisioning.models"

/**
 * Copies yuekbox's Python tools into `<home>/scripts/`, flattened so the
 * scripts can import each other as siblings. Idempotent: a rerun overwrites
 * our own files and nothing else. Provisioning calls this before it builds
 * the environment that runs them.
 */
export type InstallScripts = (
  scriptsDir: string,
) => Promise<Result<InstalledScripts, InstallScriptsError>>

/**
 * Finds `uv` on PATH, else fetches the pinned release into `<home>/tools/`.
 * Returns the managed copy on later runs without downloading again.
 */
export type EnsureUv = () => Promise<Result<UvTool, UvFailure>>

/** Installs every managed Python version that is not installed yet. */
export type EnsurePython = (
  uv: UvTool,
  versions: readonly string[],
) => Promise<Result<PythonState, PythonFailure>>

/**
 * Builds one environment from a pinned request. Returns `ready` when the
 * stamp matches the pins, so a rerun does no work; `installed` after a build.
 */
export type EnsureVenv = (
  uv: UvTool,
  request: VenvRequest,
) => Promise<Result<VenvState, VenvFailure>>

/** Probes the machine for an NVIDIA driver. Never throws. */
export type ReadGpuFacts = () => Promise<GpuFacts>

/**
 * The only network seam. Fetches one file and verifies its SHA-256 before it
 * lands at the destination.
 */
export type DownloadFile = (
  request: DownloadRequest,
) => Promise<Result<DownloadedFile, DownloadFailure>>

export type ProvisionAllInput = Readonly<{
  home: string
  onProgress?: (event: ProvisionProgress) => void
}>

/**
 * Runs every provisioning step in order, skipping completed ones, and stops
 * at the first failure with a retryable, plain-English failure.
 */
export type ProvisionAll = (
  input: ProvisionAllInput,
) => Promise<Result<ProvisionReport, ProvisionFailure>>
