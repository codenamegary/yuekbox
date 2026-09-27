import { provisionFailureMessage } from "./provisioning.messages"
import { ProvisionProgress } from "./provisioning.models"
import {
  activityPhrase,
  LiveLine,
  LiveTimers,
  makeLiveLine,
  liveRedrawGapMs,
} from "./provisioning.live"
import { ProvisionAll } from "./provisioning.ports"

export type ProvisioningCommandDeps = Readonly<{
  home: string
  provisionAll: ProvisionAll
  log: (line: string) => void
  /** The diagnostic stream; the process root leaves it at console.error. */
  logDetail?: (line: string) => void
  /** The raw stdout writer for the live line; the root leaves it at process.stdout.write. */
  write?: (text: string) => void
  /** The millisecond clock for the live-line redraw gap. */
  now?: () => number
  /** Whether stdout erases and redraws are safe. Default: a TTY that is not `dumb`. */
  isTTY?: boolean
  /** The terminal width for truncating the live line. */
  columns?: number
  /** The redraw timer seam; tests flush it by hand. */
  timers?: LiveTimers
}>

const progressLine = (event: ProvisionProgress): string => {
  switch (event.status) {
    case "started":
      return `  ${event.label}...`
    case "completed":
      return `  done  ${event.label}`
    case "skipped":
      return `  done  ${event.label} (already done)`
    case "failed":
      return `  failed  ${event.label}`
  }
}

const defaultTimers: LiveTimers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

const defaultWriter = (text: string): void => {
  process.stdout.write(text)
}

/** The live-line wiring: real stdout unless the command deps say otherwise. */
const makeLive = (deps: ProvisioningCommandDeps): LiveLine =>
  makeLiveLine({
    enabled: deps.isTTY ?? (process.stdout.isTTY === true && process.env.TERM !== "dumb"),
    write: deps.write ?? defaultWriter,
    now: deps.now ?? (() => Date.now()),
    columns: deps.columns ?? process.stdout.columns ?? 80,
    gapMs: liveRedrawGapMs,
    timers: deps.timers ?? defaultTimers,
  })

/** Renders one progress event: activity redraws the live line, steps print durably. */
const renderProgress = (
  log: (line: string) => void,
  logDetail: (line: string) => void,
  live: LiveLine,
  event: ProvisionProgress,
): void => {
  if (event.detail !== undefined) {
    logDetail(event.detail)
    live.update(activityPhrase(event.step, event.detail))
    return
  }
  live.clear()
  if (event.status === "started") live.begin(event.label)
  log(progressLine(event))
}

const retryHint = "Run yuekbox --provision to retry."

const unexpectedFailureMessage =
  "yuekbox could not finish setting up. Check your internet connection, then try again."

/** Runs provisioning; a thrown setup maps to null for the catch-all message. */
const provisionOrFail = async (
  deps: ProvisioningCommandDeps,
  live: LiveLine,
  logDetail: (line: string) => void,
): Promise<Awaited<ReturnType<ProvisionAll>> | null> => {
  try {
    return await deps.provisionAll({
      home: deps.home,
      onProgress: (event) => renderProgress(deps.log, logDetail, live, event),
    })
  } catch {
    return null
  } finally {
    // Failures and throws leave no half-drawn line.
    live.clear()
  }
}

/**
 * The `--provision` command. Streams one plain-English line per piece, redraws
 * that line in place with live installer activity on a terminal, and on a stop
 * prints the mapped message on stdout with the raw detail on stderr, then a
 * retry hint, then exits nonzero. Piped output gets the durable lines only.
 */
export const runProvisioningCommand = async (deps: ProvisioningCommandDeps): Promise<number> => {
  const logDetail = deps.logDetail ?? ((line: string) => console.error(line))
  const live = makeLive(deps)
  deps.log("Setting up yuekbox for this machine.")

  const result = await provisionOrFail(deps, live, logDetail)
  if (result === null) {
    deps.log("")
    deps.log(unexpectedFailureMessage)
    deps.log(retryHint)
    return 1
  }

  if (!result.ok) {
    deps.log("")
    deps.log(provisionFailureMessage(result.error))
    logDetail(result.error.detail)
    deps.log(retryHint)
    return 1
  }

  deps.log("")
  deps.log("yuekbox is ready.")
  return 0
}
