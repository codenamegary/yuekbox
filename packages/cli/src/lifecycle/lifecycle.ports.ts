import { Status } from "contracts/http/status"
import { RunState } from "./lifecycle.models"

/**
 * A held lock. The fd stays open for the process's lifetime: the kernel
 * releases the lock when the process dies, so a crashed instance never
 * leaves a stale lock behind.
 */
export type LockHandle = Readonly<{
  path: string
  fd: number
}>

/**
 * Tries to take the exclusive home lock. Returns the handle when the lock was
 * free and is now held, null when another instance holds it.
 */
export type AcquireLock = (path: string) => Promise<LockHandle | null>

/** Releases a lock this process holds. */
export type ReleaseLock = (lock: LockHandle) => Promise<void>

/** True when no other process holds the lock. */
export type ProbeLock = (path: string) => Promise<boolean>

/**
 * Reads `<home>/run/yuekbox.json`. Null when the file is missing; throws when
 * it exists but cannot be parsed, so a corrupt state file is an error and not
 * a silent "stopped".
 */
export type ReadRunState = (path: string) => Promise<RunState | null>

/** Writes the state file atomically: temp file, then rename. */
export type WriteRunState = (path: string, state: RunState) => Promise<void>

/** A child process to run detached, its output pointed at the log file. */
export type DetachedSpawn = Readonly<{
  /** Full command: exec path, optional script, then the user's flags. */
  cmd: readonly string[]
  logPath: string
}>

/** The spawned child: its pid and a promise that settles when it exits. */
export type DetachedChild = Readonly<{
  pid: number
  /** Resolves with the exit code, or -1 when killed by a signal. */
  exited: Promise<number>
}>

/** Spawns a child in its own session, detached from the terminal. */
export type SpawnDetached = (request: DetachedSpawn) => Promise<DetachedChild>

/**
 * Signals a pid. False when the process does not exist (ESRCH), true when the
 * signal was delivered.
 */
export type SignalPid = (pid: number, signal: "SIGTERM" | "SIGKILL") => Promise<boolean>

/**
 * Best-effort GET /v1/status against the running instance. Null on any
 * failure, timeout, or payload that does not match the contract: the probe is
 * enrichment, never the verdict.
 */
export type ProbeService = (origin: string) => Promise<Status | null>

/** The last `maxBytes` of a text file, "" when it does not exist. */
export type ReadLogTail = (path: string, maxBytes: number) => Promise<string>

/**
 * Rotates `path` to `path.1` (replacing any old `.1`) once the file reached
 * the configured size. True when a rotation happened.
 */
export type RotateLog = (path: string) => Promise<boolean>

/** Removes a file or a directory tree; missing paths are fine. */
export type RemovePath = (path: string) => Promise<void>

/** Direct entries of a directory; [] when it does not exist. */
export type ListEntries = (path: string) => Promise<readonly string[]>

/** Milliseconds since the epoch. */
export type Now = () => number

/** Resolves after the given delay. */
export type Sleep = (ms: number) => Promise<void>

/** One line of human output. */
export type Out = (line: string) => void

/**
 * Asks a yes/no question and resolves with the answer. An empty answer takes
 * the default; the adapter renders the `[Y/n]` / `[y/N]` suffix.
 */
export type PromptYesNo = (question: string, defaultYes: boolean) => Promise<boolean>

/** True when stdin is a terminal, so prompts are worth showing. */
export type StdinIsTty = () => boolean
