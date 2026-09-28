import chalk from "chalk"
import { Status } from "contracts/http/status"
import { durationHuman, serviceLine, serviceUrl, uptimeSeconds, RunState } from "./lifecycle.models"
import { Now, Out, ProbeLock, ProbeService, ReadRunState } from "./lifecycle.ports"

export type StatusDeps = Readonly<{
  readState: ReadRunState
  probeLock: ProbeLock
  probeService: ProbeService
  now: Now
  out: Out
}>

export type StatusInput = Readonly<{
  home: string
  lockPath: string
  statePath: string
  json: boolean
}>

/**
 * A corrupt state file is an error (exit 1), a missing one is just stopped;
 * the adapter returns null for missing and throws for unreadable.
 */
const readStateExact = async (
  readState: ReadRunState,
  path: string,
): Promise<RunState | null | "corrupt"> =>
  readState(path).then(
    (state) => state,
    () => "corrupt",
  )

type StatusPayload = Readonly<{
  state: "running" | "stopped"
  pid: number | null
  url: string | null
  home: string
  version: string | null
  startedAt: string | null
  uptimeSeconds: number | null
  logPath: string | null
  service: Status | null
}>

const basePayload = (input: StatusInput, state: "running" | "stopped"): StatusPayload => ({
  state,
  pid: null,
  url: null,
  home: input.home,
  version: null,
  startedAt: null,
  uptimeSeconds: null,
  logPath: null,
  service: null,
})

const runningPayload = (
  input: StatusInput,
  state: RunState,
  service: Status | null,
  nowMs: number,
): StatusPayload => ({
  ...basePayload(input, "running"),
  pid: state.pid,
  url: serviceUrl(state),
  version: state.version,
  startedAt: state.startedAt,
  uptimeSeconds: uptimeSeconds(state, nowMs),
  logPath: state.logPath,
  service,
})

/**
 * Reports whether yuekbox runs, keyed on the exclusive home lock — a free
 * lock beats any file on disk, so a stale state file can never fool status.
 * The HTTP probe is best-effort enrichment only: a failed probe leaves
 * `service` null and the verdict alone decides the exit code. 0 running,
 * 3 stopped, 1 when the state file cannot be read while running.
 */
export const makeStatus =
  (deps: StatusDeps) =>
  async (input: StatusInput): Promise<number> => {
    if (await deps.probeLock(input.lockPath)) {
      if (input.json) deps.out(JSON.stringify(basePayload(input, "stopped"), null, 2))
      else deps.out(`yuekbox is not running (home: ${input.home})`)
      return 3
    }

    const state = await readStateExact(deps.readState, input.statePath)
    if (state === "corrupt") {
      deps.out(chalk.red(`yuekbox could not read its state file (${input.statePath})`))
      return 1
    }

    if (state === null) {
      // The lock is held but the child has not written its state file yet: it
      // is still booting. The verdict stands, the details are just not there.
      if (input.json) deps.out(JSON.stringify(basePayload(input, "running"), null, 2))
      else deps.out(chalk.green("yuekbox is running (still starting)"))
      return 0
    }

    const service = await deps.probeService(serviceUrl(state))
    if (input.json) {
      deps.out(JSON.stringify(runningPayload(input, state, service, deps.now()), null, 2))
    } else {
      deps.out(chalk.green(`yuekbox is running (pid ${state.pid})`))
      deps.out(`  url       ${serviceUrl(state)}`)
      deps.out(`  home      ${input.home}`)
      deps.out(`  version   ${state.version}`)
      deps.out(`  uptime    ${durationHuman(uptimeSeconds(state, deps.now()))}`)
      deps.out(`  log       ${state.logPath}`)
      if (service !== null) deps.out(`  service   ${serviceLine(service)}`)
    }
    return 0
  }
