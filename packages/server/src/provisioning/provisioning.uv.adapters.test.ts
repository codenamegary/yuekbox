import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { err, ok } from "../shared/result"
import { ProcessRunner } from "../shared/process"
import { DownloadFile } from "./provisioning.ports"
import { makeEnsureUv } from "./provisioning.uv.adapters"

const withTempDir = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "yuekbox-uv-test-"))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const neverDownload: DownloadFile = async () => {
  throw new Error("downloadFile should not be called")
}

const neverRun: ProcessRunner = async () => {
  throw new Error("runProcess should not be called")
}

test("prefers uv on PATH and does nothing else", async () => {
  await withTempDir(async (dir) => {
    const ensureUv = makeEnsureUv({
      home: dir,
      findExecutable: (name) => (name === "uv" ? "/usr/local/bin/uv" : null),
      downloadFile: neverDownload,
      runProcess: neverRun,
    })

    const result = await ensureUv()

    expect(result).toEqual({ ok: true, value: { path: "/usr/local/bin/uv", source: "system" } })
  })
})

test("reuses the managed uv on a rerun without downloading", async () => {
  await withTempDir(async (dir) => {
    const managed = join(dir, "tools", "uv-0.9.18", "uv")
    await mkdir(dirname(managed), { recursive: true })
    await writeFile(managed, "#!/bin/sh\n", "utf8")
    const ensureUv = makeEnsureUv({
      home: dir,
      findExecutable: () => null,
      downloadFile: neverDownload,
      runProcess: neverRun,
    })

    const result = await ensureUv()

    expect(result).toEqual({ ok: true, value: { path: managed, source: "managed" } })
  })
})

test("fetches the pinned archive and extracts it into <home>/tools", async () => {
  await withTempDir(async (dir) => {
    const managed = join(dir, "tools", "uv-0.9.18", "uv")
    const archive = join(dir, "tools", "uv-0.9.18.tar.gz")
    const downloadRequests: string[] = []
    const commands: string[][] = []
    const downloadFile: DownloadFile = async (request) => {
      downloadRequests.push(`${request.url} ${request.sha256}`)
      await mkdir(dirname(request.destPath), { recursive: true })
      await writeFile(request.destPath, "archive bytes", "utf8")
      return ok({ path: request.destPath, bytes: 13 })
    }
    const runProcess: ProcessRunner = async (command) => {
      commands.push([...command])
      await mkdir(dirname(managed), { recursive: true })
      await writeFile(managed, "#!/bin/sh\n", "utf8")
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const ensureUv = makeEnsureUv({
      home: dir,
      findExecutable: () => null,
      downloadFile,
      runProcess,
    })

    const result = await ensureUv()

    expect(result).toEqual({ ok: true, value: { path: managed, source: "managed" } })
    expect(downloadRequests).toEqual([
      "https://github.com/astral-sh/uv/releases/download/0.9.18/uv-x86_64-unknown-linux-gnu.tar.gz c2def3db178ade63933fa15ffc96e882c196ce53e06173dcee05b36c5f6f68f5",
    ])
    expect(commands).toEqual([
      ["tar", "-xzf", archive, "--strip-components=1", "-C", join(dir, "tools", "uv-0.9.18")],
    ])
    expect(existsSync(managed)).toBe(true)
  })
})

test("a download failure fails with a uv_unavailable error", async () => {
  await withTempDir(async (dir) => {
    const ensureUv = makeEnsureUv({
      home: dir,
      findExecutable: () => null,
      downloadFile: async () => err({ kind: "download_failed", detail: "HTTP 500" }),
      runProcess: neverRun,
    })

    const result = await ensureUv()

    expect(result).toEqual({ ok: false, error: { kind: "uv_unavailable", detail: "HTTP 500" } })
  })
})

test("an extraction failure fails with the exit detail", async () => {
  await withTempDir(async (dir) => {
    const ensureUv = makeEnsureUv({
      home: dir,
      findExecutable: () => null,
      downloadFile: async (request) => {
        await mkdir(dirname(request.destPath), { recursive: true })
        await writeFile(request.destPath, "not really a tar", "utf8")
        return ok({ path: request.destPath, bytes: 15 })
      },
      runProcess: async () => ({ exitCode: 2, stdout: "", stderrTail: "gzip: bad magic" }),
    })

    const result = await ensureUv()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("uv_unavailable")
    expect(result.error.detail).toContain("gzip: bad magic")
  })
})

test("an extract that does not produce the binary fails", async () => {
  await withTempDir(async (dir) => {
    const ensureUv = makeEnsureUv({
      home: dir,
      findExecutable: () => null,
      downloadFile: async (request) => ok({ path: request.destPath, bytes: 0 }),
      runProcess: async () => ({ exitCode: 0, stdout: "", stderrTail: "" }),
    })

    const result = await ensureUv()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("uv_unavailable")
    expect(result.error.detail).toContain("uv-0.9.18")
  })
})

test("an extractor that cannot start fails cleanly", async () => {
  await withTempDir(async (dir) => {
    const ensureUv = makeEnsureUv({
      home: dir,
      findExecutable: () => null,
      downloadFile: async (request) => {
        await mkdir(dirname(request.destPath), { recursive: true })
        await writeFile(request.destPath, "archive bytes", "utf8")
        return ok({ path: request.destPath, bytes: 13 })
      },
      runProcess: async () => {
        throw new Error("spawn tar ENOENT")
      },
    })

    const result = await ensureUv()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("uv_unavailable")
    expect(result.error.detail).toContain("tar")
  })
})
