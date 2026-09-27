import chalk from "chalk"
import { killGraceMs, pollIntervalMs, stopTimeoutMs, RunState } from "./lifecycle.models"
import { Now, Out, ProbeLock, ReadRunState, RemovePath, SignalPid, Sleep } from "./lifecycle.ports"

export type StopDeps = Readonly<{
  readState: ReadRunState
  probeLock: ProbeLock
  signalPid: SignalPid
  now: Now
  sleep: Sleep
  removePath: RemovePath
  out: Out
}>

export type StopInput = Readonly<{
  lockPath: string
  statePath: string
}>

const readStateOrNull = async (readState: ReadRunState, path: string): Promise<RunState | null> =>
  readState(path).catch(() => null)

/** A state file with a free lock is a leftover: remove it so nothing trips on it. */
const clearStaleState = async (deps: StopDeps, input: StopInput): Promise<void> => {
  const state = await readStateOrNull(deps.readState, input.statePath)
  if (state !== null) await deps.removePath(input.statePath)
}

/**
 * Stops the instance holding the home lock: SIGTERM, wait up to 10 s, SIGKILL,
 * then a short final grace. Synchronous on purpose — when this returns 0 the
 * lock is free and the process is gone. Returns 0 when stopped or not running,
 * 1 when it would not die.
 */
export const makeStop =
  (deps: StopDeps) =>
  async (input: StopInput): Promise<number> => {
    if (await deps.probeLock(input.lockPath)) {
      await clearStaleState(deps, input)
      deps.out("yuekbox is not running")
      return 0
    }

    const state = await readStateOrNull(deps.readState, input.statePath)
    if (state === null) {
      deps.out(chalk.red(`yuekbox is running, but ${input.statePath} could not be read`))
      return 1
    }

    deps.out(`waiting for pid ${state.pid} to exit…`)
    await deps.signalPid(state.pid, "SIGTERM")
    const deadline = deps.now() + stopTimeoutMs
    for (;;) {
      if (await deps.probeLock(input.lockPath)) break
      if (deps.now() >= deadline) break
      await deps.sleep(pollIntervalMs)
    }

    if (!(await deps.probeLock(input.lockPath))) {
      await deps.signalPid(state.pid, "SIGKILL")
      const killDeadline = deps.now() + killGraceMs
      for (;;) {
        if (await deps.probeLock(input.lockPath)) break
        if (deps.now() >= killDeadline) break
        await deps.sleep(pollIntervalMs)
      }
    }

    if (!(await deps.probeLock(input.lockPath))) {
      deps.out(chalk.red(`yuekbox (pid ${state.pid}) did not stop`))
      return 1
    }
    await clearStaleState(deps, input)
    deps.out(chalk.green("yuekbox stopped"))
    return 0
  }
