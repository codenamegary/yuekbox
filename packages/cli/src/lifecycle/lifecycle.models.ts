import { z } from "zod"
import { TimestampSchema } from "contracts/http/primitives"
import { Status } from "contracts/http/status"

/** The four lifecycle commands the yuekbox binary answers to. */
export type LifecycleCommand = "start" | "stop" | "status" | "uninstall"

/**
 * The running instance's on-disk state: `<home>/run/yuekbox.json`. The child
 * writes it only once both listeners are up, so its presence is the parent's
 * "actually serving" signal. The lock, never this file, is the verdict on
 * whether yuekbox is running.
 */
export const RunStateSchema = z.strictObject({
  pid: z.number().int().positive(),
  host: z.string().min(1),
  port: z.number().int().positive(),
  version: z.string().min(1),
  startedAt: TimestampSchema,
  logPath: z.string().min(1),
})

export type RunState = z.infer<typeof RunStateSchema>

export const stateFileName = "yuekbox.json"
export const lockFileName = "yuekbox.lock"
export const logFileName = "yuekbox.log"

/** A start appends to the log and rotates it to `.1` past this size. */
export const logRotateBytes = 5 * 1024 * 1024

/** How long `start` waits for the child to write the state file. */
export const startTimeoutMs = 15_000

/** How long `stop` waits between SIGTERM and SIGKILL. */
export const stopTimeoutMs = 10_000

/** How long `stop` waits after SIGKILL before giving up. */
export const killGraceMs = 2_000

/** How long the status HTTP probe waits before giving up (best-effort). */
export const probeTimeoutMs = 2_000

/** Poll cadence for the start, stop, and status waits. */
export const pollIntervalMs = 200

/** How much of the log a failed start prints. */
export const logTailBytes = 4096

/** The URL the user opens, from the state file's public listener fields. */
export const serviceUrl = (state: RunState): string => `http://${state.host}:${state.port}`

/** Whole seconds the process described by the state file has been up. */
export const uptimeSeconds = (state: RunState, nowMs: number): number =>
  Math.max(0, Math.floor((nowMs - Date.parse(state.startedAt)) / 1000))

/**
 * `12m 4s`-style uptime: the two biggest non-zero units, seconds always last.
 */
export const durationHuman = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${rest}s`
  return `${rest}s`
}

/**
 * The one-line service summary under `status`: the GET /v1/status payload
 * condensed to the fields that matter when a human asks "is it healthy".
 */
export const serviceLine = (service: Status): string =>
  `${service.state} · queue ${service.queueDepth} · gpu ${service.gpuBusy ? "busy" : "idle"} · ffmpeg ${service.ffmpeg} · yue2 ${service.yue2}`
