import { join } from "node:path"
import { lockFileName, logFileName, stateFileName } from "./lifecycle.models"

/**
 * The run-state and log paths, built on the server's home layout and the
 * models' file names so the lifecycle and everything else in the home can
 * never disagree about where they live. `<home>/run` and `<home>/logs` are
 * part of `homeLayout`.
 */
export const runStatePath = (home: string): string => join(home, "run", stateFileName)

export const runLockPath = (home: string): string => join(home, "run", lockFileName)

export const logFilePath = (home: string): string => join(home, "logs", logFileName)

/**
 * The yuekbox executable as launched. A compiled binary is its own
 * interpreter, so `process.execPath` is the executable. An npm install runs
 * `bun <bin/yuekbox>`, so the entry is `argv[1]` and `process.execPath` is
 * the bun runtime, which uninstall must never remove.
 */
export const entryExecutablePath = (
  standalone: boolean,
  argv: readonly string[] | undefined,
  execPath: string,
): string => {
  if (standalone) return execPath
  const entry = argv?.[1]
  return typeof entry === "string" && entry.length > 0 ? entry : execPath
}

/**
 * The home buckets `uninstall` may remove, models included so callers can
 * treat it separately: app data removes every bucket except models.
 */
export type HomeBuckets = Readonly<{
  config: string
  tools: string
  models: string
  venvs: string
  scripts: string
  data: string
  run: string
  logs: string
}>

export const homeBuckets = (home: string): HomeBuckets =>
  Object.freeze({
    config: join(home, "config.yaml"),
    tools: join(home, "tools"),
    models: join(home, "models"),
    venvs: join(home, "venvs"),
    scripts: join(home, "scripts"),
    data: join(home, "data"),
    run: join(home, "run"),
    logs: join(home, "logs"),
  })

/** Every bucket except models, in removal order. */
export const dataBuckets = (home: string): readonly string[] => {
  const buckets = homeBuckets(home)
  return [
    buckets.config,
    buckets.tools,
    buckets.venvs,
    buckets.scripts,
    buckets.data,
    buckets.run,
    buckets.logs,
  ]
}
