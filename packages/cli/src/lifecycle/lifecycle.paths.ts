import { join } from "node:path"

/**
 * The run-state and log paths, built on the server's home layout so the
 * lifecycle and everything else in the home can never disagree about where
 * they live. `<home>/run` and `<home>/logs` are part of `homeLayout`.
 */
export const runStatePath = (home: string): string => join(home, "run", "yuekbox.json")

export const runLockPath = (home: string): string => join(home, "run", "yuekbox.lock")

export const logFilePath = (home: string): string => join(home, "logs", "yuekbox.log")

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
