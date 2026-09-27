import chalk from "chalk"
import {
  logTailBytes,
  pollIntervalMs,
  serviceUrl,
  startTimeoutMs,
  RunState,
} from "./lifecycle.models"
import {
  Now,
  Out,
  ProbeLock,
  ReadLogTail,
  ReadRunState,
  RotateLog,
  Sleep,
  SpawnDetached,
} from "./lifecycle.ports"

export type StartDeps = Readonly<{
  probeLock: ProbeLock
  spawnDetached: SpawnDetached
  readState: ReadRunState
  readLogTail: ReadLogTail
  rotateLog: RotateLog
  now: Now
  sleep: Sleep
  out: Out
}>

export type StartInput = Readonly<{
  lockPath: string
  statePath: string
  logPath: string
  /** The full re-exec command: exec path, optional script, then the user's flags. */
  cmd: readonly string[]
}>

/** A missing or unreadable state file never blocks the flow; null covers both. */
const readStateOrNull = async (readState: ReadRunState, path: string): Promise<RunState | null> =>
  readState(path).catch(() => null)

/**
 * Starts yuekbox detached and waits for it to serve. The exclusive home lock
 * is the source of truth: held means already running (report it, spawn
 * nothing, exit 0). Otherwise the log rotates, the daemon child spawns, and
 * the parent polls for a state file written by that child's pid. The child
 * only writes it once both listeners are up, so the write is the "actually
 * serving" moment. Returns the process exit code: 0 or 1.
 */
export const makeStart =
  (deps: StartDeps) =>
  async (input: StartInput): Promise<number> => {
    if (!(await deps.probeLock(input.lockPath))) {
      const running = await readStateOrNull(deps.readState, input.statePath)
      if (running === null) {
        deps.out("yuekbox is already running")
      } else {
        deps.out(`yuekbox is already running (pid ${running.pid})`)
        deps.out(`  url   ${serviceUrl(running)}`)
      }
      return 0
    }

    await deps.rotateLog(input.logPath)
    const child = await deps.spawnDetached({ cmd: input.cmd, logPath: input.logPath })
    const deadline = deps.now() + startTimeoutMs
    for (;;) {
      const state = await readStateOrNull(deps.readState, input.statePath)
      if (state !== null && state.pid === child.pid) {
        deps.out(chalk.green(`yuekbox started (pid ${state.pid})`))
        deps.out(`  url   ${serviceUrl(state)}`)
        deps.out(`  log   ${state.logPath}`)
        return 0
      }
      const died = await Promise.race([
        child.exited.then(() => true),
        deps.sleep(pollIntervalMs).then(() => false),
      ])
      if (died || deps.now() >= deadline) break
    }

    deps.out(chalk.red("yuekbox failed to start"))
    const tail = (await deps.readLogTail(input.logPath, logTailBytes)).trimEnd()
    if (tail !== "") deps.out(tail)
    return 1
  }
