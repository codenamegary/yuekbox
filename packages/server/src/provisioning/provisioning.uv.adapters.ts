import { existsSync } from "node:fs"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { ProcessOutcome, ProcessRunner } from "../shared/process"
import { err, ok } from "../shared/result"
import { homeLayout } from "../shared/home"
import { uvPin } from "./provisioning.packages"
import { DownloadFile, EnsureUv } from "./provisioning.ports"

export type EnsureUvEnv = Readonly<{
  home: string
  downloadFile: DownloadFile
  runProcess: ProcessRunner
}>

/** `<home>/tools/uv-<version>/uv`, the copy yuekbox owns. */
export const managedUvPath = (home: string): string =>
  join(homeLayout(home).tools, `uv-${uvPin.version}`, "uv")

/** `<home>/tools/uv-<version>.tar.gz`, kept beside the extracted copy. */
export const uvArchivePath = (home: string): string =>
  join(homeLayout(home).tools, `uv-${uvPin.version}.tar.gz`)

/** `<home>/tools/uv-<version>.json`, written only after a verified install. */
export const uvStampPath = (home: string): string =>
  join(homeLayout(home).tools, `uv-${uvPin.version}.json`)

/** Where an archive extracts before it is moved into place. */
export const uvStagingPath = (home: string): string =>
  join(homeLayout(home).tools, `uv-${uvPin.version}.staging`)

/**
 * Fetches the pinned uv release into `<home>/tools/`. A uv found on PATH is
 * deliberately ignored: an unknown uv version fails in slow, confusing ways
 * (an old one rejects `--no-bin` with a message that reads like a network
 * problem), and the pinned one costs one download per machine. The extract
 * lands in a staging directory and is renamed into place only once the
 * binary is present, so an interrupted run never leaves a half-extracted
 * copy that looks installed. The stamp is the last thing written, and a
 * rerun without it starts over.
 */
export const makeEnsureUv = (env: EnsureUvEnv): EnsureUv => {
  return async () => {
    const managed = managedUvPath(env.home)
    const stamp = uvStampPath(env.home)
    if (existsSync(managed) && existsSync(stamp)) {
      return ok({ path: managed })
    }

    const tools = homeLayout(env.home).tools
    const installDir = join(tools, `uv-${uvPin.version}`)
    const staging = uvStagingPath(env.home)
    const archive = uvArchivePath(env.home)
    const downloaded = await env.downloadFile({
      url: uvPin.archiveUrl,
      destPath: archive,
      sha256: uvPin.sha256,
    })
    if (!downloaded.ok) {
      return err({ kind: "uv_unavailable", detail: downloaded.error.detail })
    }

    try {
      await mkdir(tools, { recursive: true })
      await rm(staging, { recursive: true, force: true })
    } catch (error: unknown) {
      return err({
        kind: "uv_unavailable",
        detail: `could not create ${tools}: ${describe(error)}`,
      })
    }

    let outcome: ProcessOutcome
    try {
      outcome = await env.runProcess(
        ["tar", "-xzf", archive, "--strip-components=1", "-C", staging],
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
      await rm(staging, { recursive: true, force: true }).catch(() => undefined)
      const detail = outcome.stderrTail.trim() || `tar exited with code ${outcome.exitCode}`
      return err({ kind: "uv_unavailable", detail })
    }
    if (!existsSync(join(staging, "uv"))) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined)
      return err({
        kind: "uv_unavailable",
        detail: `the archive did not contain a uv binary under uv-${uvPin.version}`,
      })
    }

    try {
      await rm(installDir, { recursive: true, force: true })
      await rename(staging, installDir)
      await writeFile(stamp, `${JSON.stringify({ version: uvPin.version }, null, 2)}\n`, "utf8")
    } catch (error: unknown) {
      return err({
        kind: "uv_unavailable",
        detail: `could not install uv into ${installDir}: ${describe(error)}`,
      })
    }

    return ok({ path: managed })
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
