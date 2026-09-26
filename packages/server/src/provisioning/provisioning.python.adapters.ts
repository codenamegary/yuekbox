import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { envWithout, ProcessOutcome, ProcessRunner } from "../shared/process"
import { describeError } from "../shared/describe"
import { err, ok } from "../shared/result"
import { homeLayout } from "../shared/home"
import { z } from "zod"
import { EnsurePython, EnsureVenv } from "./provisioning.ports"

export type PythonAdapterEnv = Readonly<{
  home: string
  runProcess: ProcessRunner
}>

/** `<home>/tools/python`, where uv keeps the managed interpreters. */
export const managedPythonDir = (home: string): string => join(homeLayout(home).tools, "python")

/** `<home>/tools/cache`, uv's package and interpreter download cache. */
export const uvCacheDir = (home: string): string => join(homeLayout(home).tools, "cache")

/**
 * Everything uv gets from us: the parent environment minus the user's own
 * uv configuration (every `UV_*` variable, and their uv.toml too through
 * `UV_NO_CONFIG`), interpreters under the home, and downloads cached under
 * the home. Nothing in the user's setup can redirect the install.
 */
const uvEnv = (home: string): Readonly<Record<string, string>> => ({
  ...envWithout(["UV_"]),
  UV_PYTHON_INSTALL_DIR: managedPythonDir(home),
  UV_CACHE_DIR: uvCacheDir(home),
  UV_NO_CONFIG: "1",
})

/**
 * Marks one interpreter as installed. uv installs are idempotent, but the
 * stamp keeps a rerun from even asking, and an interrupted install (no stamp)
 * is simply retried.
 */
export const pythonStampPath = (home: string, version: string): string =>
  join(managedPythonDir(home), `.yuekbox-${version}.json`)

/** `<venv>/.yuekbox.json`, the build stamp carrying the pin fingerprint. */
export const venvStampPath = (dir: string): string => join(dir, ".yuekbox.json")

const describeExit = (outcome: { exitCode: number; stderrTail: string }, what: string): string =>
  outcome.stderrTail.trim() || `${what} exited with code ${outcome.exitCode}`

/**
 * Installs every managed Python version with uv into `<home>/tools/python`.
 * uv keeps the builds self-contained there, so nothing depends on a system
 * install and the user never chooses one.
 */
export const makeEnsurePython = (env: PythonAdapterEnv): EnsurePython => {
  return async (uv, versions) => {
    const installDir = managedPythonDir(env.home)
    let installedAny = false

    for (const version of versions) {
      if (existsSync(pythonStampPath(env.home, version))) continue

      try {
        await mkdir(installDir, { recursive: true })
      } catch (error: unknown) {
        return err({
          kind: "python_unavailable",
          detail: `could not create ${installDir}: ${describeError(error)}`,
        })
      }

      let outcome: ProcessOutcome
      try {
        outcome = await env.runProcess(
          [uv.path, "python", "install", "--install-dir", installDir, "--no-bin", version],
          env.home,
          () => undefined,
          uvEnv(env.home),
        )
      } catch (error: unknown) {
        return err({
          kind: "python_unavailable",
          detail: `could not run uv: ${describeError(error)}`,
        })
      }
      if (outcome.exitCode !== 0) {
        return err({
          kind: "python_unavailable",
          detail: describeExit(outcome, `python install ${version}`),
        })
      }

      try {
        await writeFile(
          pythonStampPath(env.home, version),
          `${JSON.stringify({ version }, null, 2)}\n`,
          "utf8",
        )
      } catch (error: unknown) {
        return err({
          kind: "python_unavailable",
          detail: `could not stamp ${version}: ${describeError(error)}`,
        })
      }
      installedAny = true
    }

    return ok({ status: installedAny ? "installed" : "ready" })
  }
}

type VenvStamp = Readonly<{ fingerprint: string }>

const VenvStampSchema = z.looseObject({ fingerprint: z.string() })

const readStamp = async (path: string): Promise<VenvStamp | null> => {
  try {
    const parsed = VenvStampSchema.safeParse(JSON.parse(await readFile(path, "utf8")))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Builds one environment with uv: create it with the managed interpreter,
 * install the exact pins through the pinned indexes, then stamp the
 * fingerprint. A matching stamp skips everything, so reruns are no-ops; a
 * failed install leaves no stamp and the next run clears the half-built
 * directory and starts over.
 */
export const makeEnsureVenv = (env: PythonAdapterEnv): EnsureVenv => {
  return async (uv, request) => {
    const stampPath = venvStampPath(request.dir)
    if (existsSync(stampPath)) {
      const stamp = await readStamp(stampPath)
      if (stamp?.fingerprint === request.fingerprint) {
        return ok({ status: "ready" })
      }
    }

    try {
      await rm(request.dir, { recursive: true, force: true })
      await mkdir(dirname(request.dir), { recursive: true })
    } catch (error: unknown) {
      return err({
        kind: "venv_failed",
        detail: `could not clear ${request.dir}: ${describeError(error)}`,
      })
    }

    let venv: ProcessOutcome
    try {
      venv = await env.runProcess(
        [uv.path, "venv", "--python", request.pythonVersion, request.dir],
        env.home,
        () => undefined,
        uvEnv(env.home),
      )
    } catch (error: unknown) {
      return err({ kind: "venv_failed", detail: `could not run uv: ${describeError(error)}` })
    }
    if (venv.exitCode !== 0) {
      return err({
        kind: "venv_failed",
        detail: describeExit(venv, `venv ${request.name}`),
      })
    }

    let install: ProcessOutcome
    try {
      install = await env.runProcess(
        [
          uv.path,
          "pip",
          "install",
          "--python",
          join(request.dir, "bin", "python"),
          "--index-url",
          request.indexUrl,
          "--extra-index-url",
          request.extraIndexUrl,
          ...request.packages,
        ],
        env.home,
        () => undefined,
        uvEnv(env.home),
      )
    } catch (error: unknown) {
      return err({ kind: "venv_failed", detail: `could not run uv: ${describeError(error)}` })
    }
    if (install.exitCode !== 0) {
      return err({
        kind: "venv_failed",
        detail: describeExit(install, `installing ${request.name}`),
      })
    }

    try {
      await mkdir(request.dir, { recursive: true })
      await writeFile(
        stampPath,
        `${JSON.stringify(
          {
            fingerprint: request.fingerprint,
            pythonVersion: request.pythonVersion,
            indexUrl: request.indexUrl,
          },
          null,
          2,
        )}\n`,
        "utf8",
      )
    } catch (error: unknown) {
      return err({
        kind: "venv_failed",
        detail: `could not stamp ${request.dir}: ${describeError(error)}`,
      })
    }

    return ok({ status: "installed" })
  }
}
