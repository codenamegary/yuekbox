import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  acquireLock,
  listEntries,
  makeRotateLog,
  probeLock,
  readRunState,
  releaseLock,
  writeRunState,
} from "./lifecycle.adapters"
import { RunState } from "./lifecycle.models"

const scratch = async (): Promise<string> => mkdtemp(join(tmpdir(), "yuekbox-lifecycle-"))

test("the lock is exclusive, probeable, and releasable", async () => {
  const dir = await scratch()
  try {
    const lockPath = join(dir, "yuekbox.lock")

    expect(await probeLock(lockPath)).toBe(true)

    const lock = await acquireLock(lockPath)
    expect(lock).not.toBeNull()

    // A second acquire (a fresh open file description) must not succeed.
    expect(await acquireLock(lockPath)).toBeNull()
    expect(await probeLock(lockPath)).toBe(false)

    await releaseLock(lock as NonNullable<typeof lock>)
    expect(await probeLock(lockPath)).toBe(true)

    const reacquired = await acquireLock(lockPath)
    expect(reacquired).not.toBeNull()
    if (reacquired !== null) await releaseLock(reacquired)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("the state file round-trips, reports missing as null, and corrupt as a throw", async () => {
  const dir = await scratch()
  try {
    const statePath = join(dir, "run", "yuekbox.json")
    expect(await readRunState(statePath)).toBeNull()

    const state: RunState = {
      pid: 4242,
      host: "127.0.0.1",
      port: 3000,
      version: "0.4.0",
      startedAt: new Date().toISOString(),
      logPath: join(dir, "logs", "yuekbox.log"),
    }
    await writeRunState(statePath, state)
    expect(await readRunState(statePath)).toEqual(state)

    // The atomic write leaves no temp file behind.
    expect(await listEntries(join(dir, "run"))).toEqual(["yuekbox.json"])

    await writeFile(statePath, "{ not json", "utf8")
    expect(readRunState(statePath)).rejects.toThrow()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("a small log never rotates", async () => {
  const dir = await scratch()
  try {
    const logPath = join(dir, "yuekbox.log")
    await writeFile(logPath, "tiny", "utf8")
    expect(await makeRotateLog(1_000)(logPath)).toBe(false)
    await stat(logPath)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("a log past the limit rotates to `.1`, replacing any old `.1`", async () => {
  const dir = await scratch()
  try {
    const logPath = join(dir, "yuekbox.log")
    await writeFile(join(dir, "yuekbox.log.1"), "the old rotated log", "utf8")
    await writeFile(logPath, "x".repeat(2_000), "utf8")

    expect(await makeRotateLog(1_000)(logPath)).toBe(true)
    expect(await listEntries(dir)).toEqual(["yuekbox.log.1"])

    const rotated = await readFile1MB(join(dir, "yuekbox.log.1"))
    expect(rotated).toBe("x".repeat(2_000))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

const readFile1MB = async (path: string): Promise<string> =>
  (await Bun.file(path).text()).slice(0, 4096)

test("listEntries reports a missing folder as empty", async () => {
  const dir = await scratch()
  try {
    expect(await listEntries(join(dir, "missing"))).toEqual([])
    await mkdir(join(dir, "something"), { recursive: true })
    expect(await listEntries(join(dir, "something"))).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
