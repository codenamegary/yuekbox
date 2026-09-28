import { dlopen, FFIType } from "bun:ffi"
import { constants as fsConstants, mkdirSync, openSync, closeSync } from "node:fs"
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { spawn } from "node:child_process"
import { createInterface } from "node:readline/promises"
import { StatusSchema } from "contracts/http/status"
import { probeTimeoutMs, RunStateSchema } from "./lifecycle.models"
import {
  AcquireLock,
  ListEntries,
  Now,
  Out,
  ProbeLock,
  ProbeService,
  PromptYesNo,
  ReadLogTail,
  ReadRunState,
  ReleaseLock,
  RemovePath,
  RotateLog,
  SignalPid,
  Sleep,
  SpawnDetached,
  StdinIsTty,
  WriteRunState,
} from "./lifecycle.ports"

// The exclusive lock is a kernel `flock`, so a crashed instance can never
// leave a stale lock file behind: the kernel drops the lock when the process
// dies. Bun exposes no flock API, so the adapter calls libc directly.
const LOCK_EX = 2
const LOCK_NB = 4
const LOCK_UN = 8

const flockSymbols = { flock: { args: [FFIType.int, FFIType.int], returns: FFIType.int } }

type Flock = (fd: number, operation: number) => number

const loadFlock = (): Flock => {
  try {
    return dlopen("libc.so.6", flockSymbols).symbols.flock as unknown as Flock
  } catch {
    return dlopen("libc.musl-x86_64.so.1", flockSymbols).symbols.flock as unknown as Flock
  }
}

const flock = loadFlock()

const isErrorCode = (error: unknown, code: string): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === code

const ensureParentDir = (path: string): void => {
  try {
    mkdirSync(dirname(path), { recursive: true })
  } catch {
    // A real failure resurfaces on the open below.
  }
}

/**
 * Opens (or creates) the lock file. Null means "treat as missing": the lock
 * is free for probing, and acquiring retries after the folder is created.
 */
const openForLock = (path: string): number | null => {
  try {
    return openSync(path, fsConstants.O_RDWR | fsConstants.O_CREAT, 0o644)
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return null
    throw error
  }
}

export const acquireLock: AcquireLock = async (path) => {
  ensureParentDir(path)
  const fd = openForLock(path)
  if (fd === null) throw new Error(`could not open the lock file at ${path}`)
  if (flock(fd, LOCK_EX | LOCK_NB) !== 0) {
    closeSync(fd)
    return null
  }
  return { path, fd }
}

export const releaseLock: ReleaseLock = async (lock) => {
  flock(lock.fd, LOCK_UN)
  closeSync(lock.fd)
}

export const probeLock: ProbeLock = async (path) => {
  const fd = openForLock(path)
  if (fd === null) return true
  const free = flock(fd, LOCK_EX | LOCK_NB) === 0
  if (free) flock(fd, LOCK_UN)
  closeSync(fd)
  return free
}

const readFileOrNull = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return null
    throw error
  }
}

export const readRunState: ReadRunState = async (path) => {
  const raw = await readFileOrNull(path)
  if (raw === null) return null
  const parsed = RunStateSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error(`${path} is not a yuekbox state file`)
  return parsed.data
}

export const writeRunState: WriteRunState = async (path, state) => {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.tmp`
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8")
  await rename(temp, path)
}

export const spawnDetached: SpawnDetached = async (request) => {
  const [execPath, ...args] = request.cmd
  if (execPath === undefined) throw new Error("the daemon command is empty")
  await mkdir(dirname(request.logPath), { recursive: true })
  // The child outlives this process in its own session: stdin ignored, both
  // output streams appended to the log file.
  const logFd = openSync(request.logPath, "a")
  try {
    const child = spawn(execPath, args, {
      detached: true,
      stdio: ["ignore", logFd, logFd],
    })
    const exited = new Promise<number>((resolveExit) => {
      child.on("error", () => resolveExit(-1))
      child.on("exit", (code) => resolveExit(code ?? -1))
    })
    return { pid: child.pid ?? -1, exited }
  } finally {
    closeSync(logFd)
  }
}

export const signalPid: SignalPid = async (pid, signal) => {
  try {
    process.kill(pid, signal)
    return true
  } catch (error) {
    if (isErrorCode(error, "ESRCH")) return false
    throw error
  }
}

/** The status probe is best-effort: every failure path resolves to null. */
export const probeService: ProbeService = async (origin) => {
  try {
    const response = await fetch(new URL("/v1/status", origin), {
      signal: AbortSignal.timeout(probeTimeoutMs),
    })
    if (!response.ok) return null
    const payload: unknown = await response.json()
    const parsed = StatusSchema.safeParse(payload)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const fileSizeOrNull = async (path: string): Promise<number | null> =>
  stat(path)
    .then((info) => info.size)
    .catch((error: unknown) => {
      if (isErrorCode(error, "ENOENT")) return null
      throw error
    })

export const readLogTail: ReadLogTail = async (path, maxBytes) => {
  const size = await fileSizeOrNull(path)
  if (size === null || size === 0) return ""
  const start = Math.max(0, size - maxBytes)
  const handle = await open(path, "r")
  try {
    const length = size - start
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, start)
    return buffer.toString("utf8")
  } finally {
    await handle.close()
  }
}

export const makeRotateLog =
  (limitBytes: number): RotateLog =>
  async (path) => {
    const size = await fileSizeOrNull(path)
    if (size === null || size < limitBytes) return false
    // POSIX rename replaces the old `.1` in one step.
    await rename(path, `${path}.1`)
    return true
  }

export const removePath: RemovePath = async (path) => {
  await rm(path, { recursive: true, force: true })
}

export const listEntries: ListEntries = async (path) => {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.map((entry) => entry.name)
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return []
    throw error
  }
}

export const now: Now = () => Date.now()

export const sleep: Sleep = (ms) =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms)
  })

export const out: Out = (line) => console.log(line)

export const stdinIsTty: StdinIsTty = () => process.stdin.isTTY === true

export const promptYesNo: PromptYesNo = (question, defaultYes) => {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]"
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise<boolean>((resolveAnswer) => {
    const ask = (): void => {
      void rl
        .question(`${question} ${suffix} `)
        .then((answer) => {
          const trimmed = answer.trim().toLowerCase()
          if (trimmed === "" || trimmed === "y" || trimmed === "yes") {
            rl.close()
            resolveAnswer(trimmed !== "" ? true : defaultYes)
            return
          }
          if (trimmed === "n" || trimmed === "no") {
            rl.close()
            resolveAnswer(false)
            return
          }
          ask()
        })
        .catch(() => {
          // stdin closed mid-prompt: keep the safe default.
          rl.close()
          resolveAnswer(defaultYes)
        })
    }
    ask()
  })
}
