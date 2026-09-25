import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { ProcessOutcome, ProcessRunner } from "../shared/process"
import { err, ok } from "../shared/result"
import { homeLayout } from "../shared/home"
import { uvPin } from "./provisioning.packages"
import { DownloadFile, EnsureUv } from "./provisioning.ports"

export type EnsureUvEnv = Readonly<{
  home: string
  /** Injectable so tests never touch the real PATH. */
  findExecutable: (name: string) => string | null
  downloadFile: DownloadFile
  runProcess: ProcessRunner
}>

/** `<home>/tools/uv-<version>/uv`, the copy yuekbox owns. */
export const managedUvPath = (home: string): string =>
  join(homeLayout(home).tools, `uv-${uvPin.version}`, "uv")

/** `<home>/tools/uv-<version>.tar.gz`, kept beside the extracted copy. */
export const uvArchivePath = (home: string): string =>
  join(homeLayout(home).tools, `uv-${uvPin.version}.tar.gz`)

/**
 * Finds the uv a machine already has, else fetches the pinned release into
 * `<home>/tools/`. The second run sees the extracted binary and returns it
 * without a download, so an interrupted first run resumes at the fetch.
 */
export const makeEnsureUv = (env: EnsureUvEnv): EnsureUv => {
  return async () => {
    const onPath = env.findExecutable("uv")
    if (onPath !== null) {
      return ok({ path: onPath, source: "system" })
    }

    const managed = managedUvPath(env.home)
    if (existsSync(managed)) {
      return ok({ path: managed, source: "managed" })
    }

    const archive = uvArchivePath(env.home)
    const downloaded = await env.downloadFile({
      url: uvPin.archiveUrl,
      destPath: archive,
      sha256: uvPin.sha256,
    })
    if (!downloaded.ok) {
      return err({ kind: "uv_unavailable", detail: downloaded.error.detail })
    }

    const installDir = join(homeLayout(env.home).tools, `uv-${uvPin.version}`)
    try {
      await mkdir(installDir, { recursive: true })
    } catch (error: unknown) {
      return err({
        kind: "uv_unavailable",
        detail: `could not create ${installDir}: ${describe(error)}`,
      })
    }

    let outcome: ProcessOutcome
    try {
      outcome = await env.runProcess(
        ["tar", "-xzf", archive, "--strip-components=1", "-C", installDir],
        env.home,
        () => undefined,
      )
    } catch (error: unknown) {
      return err({
        kind: "uv_unavailable",
        detail: `could not extract the archive: ${describe(error)}`,
      })
    }
    if (outcome.exitCode !== 0) {
      const detail = outcome.stderrTail.trim() || `tar exited with code ${outcome.exitCode}`
      return err({ kind: "uv_unavailable", detail })
    }
    if (!existsSync(managed)) {
      return err({
        kind: "uv_unavailable",
        detail: `the archive did not contain a uv binary under uv-${uvPin.version}`,
      })
    }

    return ok({ path: managed, source: "managed" })
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
