import { Result } from "../shared/result"
import { InstalledScripts, InstallScriptsError } from "./provisioning.models"

/**
 * Copies yuekbox's Python tools into `<home>/scripts/`, flattened so the
 * scripts can import each other as siblings. Idempotent: a rerun overwrites
 * our own files and nothing else. Provisioning calls this before it builds
 * the venvs that run them.
 */
export type InstallScripts = (
  scriptsDir: string,
) => Promise<Result<InstalledScripts, InstallScriptsError>>
