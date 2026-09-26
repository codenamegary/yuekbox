import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { err, ok } from "../shared/result"
import { ProcessRunner } from "../shared/process"
import { DownloadFile } from "./provisioning.ports"
import { makeEnsureUv, uvStampPath } from "./provisioning.uv.adapters"

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

test("reuses the managed uv on a rerun without downloading", async () => {
  await withTempDir(async (dir) => {
    const managed = join(dir, "tools", "uv-0.9.18", "uv")
    await mkdir(dirname(managed), { recursive: true })
    await writeFile(managed, "#!/bin/sh\n", "utf8")
    await writeFile(uvStampPath(dir), "{}\n", "utf8")
    const ensureUv = makeEnsureUv({ home: dir, downloadFile: neverDownload, runProcess: neverRun })

    const result = await ensureUv()

    expect(result).toEqual({ ok: true, value: { path: managed } })
  })
})

test("rebuilds when the binary is gone even with a stamp", async () => {
  await withTempDir(async (dir) => {
    const downloads: string[] = []
    await mkdir(join(dir, "tools"), { recursive: true })
    await writeFile(uvStampPath(dir), "{}\n", "utf8")
    const ensureUv = makeEnsureUv({
      home: dir,
      downloadFile: async (request) => {
        downloads.push(request.destPath)
        await mkdir(dirname(request.destPath), { recursive: true })
        await writeFile(request.destPath, "archive bytes", "utf8")
        return ok({ path: request.destPath, bytes: 13 })
      },
      runProcess: async (command) => {
        // Stage the binary where the extract was pointed, so the rename
        // lands. The adapter creates the folder; this fake must not.
        const target = command[command.indexOf("-C") + 1]
        if (typeof target !== "string") throw new Error("no -C target")
        await writeFile(join(target, "uv"), "#!/bin/sh\n", "utf8")
        return { exitCode: 0, stdout: "", stderrTail: "" }
      },
    })

    const result = await ensureUv()

    expect(result).toEqual({ ok: true, value: { path: join(dir, "tools", "uv-0.9.18", "uv") } })
    expect(downloads).toHaveLength(1)
  })
})

test("a half-extracted copy without a stamp is not treated as installed", async () => {
  await withTempDir(async (dir) => {
    const managed = join(dir, "tools", "uv-0.9.18", "uv")
    await mkdir(dirname(managed), { recursive: true })
    await writeFile(managed, "#!/bin/sh\n", "utf8")
    const commands: string[][] = []
    const ensureUv = makeEnsureUv({
      home: dir,
      downloadFile: async (request) => {
        await mkdir(dirname(request.destPath), { recursive: true })
        await writeFile(request.destPath, "archive bytes", "utf8")
        return ok({ path: request.destPath, bytes: 13 })
      },
      runProcess: async (command) => {
        commands.push([...command])
        const target = command[command.indexOf("-C") + 1]
        if (typeof target !== "string") throw new Error("no -C target")
        await writeFile(join(target, "uv"), "#!/bin/sh\n", "utf8")
        return { exitCode: 0, stdout: "", stderrTail: "" }
      },
    })

    const result = await ensureUv()

    expect(result).toEqual({ ok: true, value: { path: managed } })
    // The install ran again instead of trusting the binary without a stamp.
    expect(commands).toHaveLength(1)
    expect(existsSync(uvStampPath(dir))).toBe(true)
  })
})

test("fetches the pinned archive, stages the extract, then stamps", async () => {
  await withTempDir(async (dir) => {
    const managed = join(dir, "tools", "uv-0.9.18", "uv")
    const archive = join(dir, "tools", "uv-0.9.18.tar.gz")
    const staging = join(dir, "tools", "uv-0.9.18.staging")
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
      // No mkdir here: the adapter owns the staging folder, and a fake that
      // pre-creates it would hide a missing mkdir in the adapter.
      await writeFile(join(staging, "uv"), "#!/bin/sh\n", "utf8")
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const ensureUv = makeEnsureUv({ home: dir, downloadFile, runProcess })

    const result = await ensureUv()

    expect(result).toEqual({ ok: true, value: { path: managed } })
    expect(downloadRequests).toEqual([
      "https://github.com/astral-sh/uv/releases/download/0.9.18/uv-x86_64-unknown-linux-gnu.tar.gz c2def3db178ade63933fa15ffc96e882c196ce53e06173dcee05b36c5f6f68f5",
    ])
    expect(commands).toEqual([["tar", "-xzf", archive, "--strip-components=1", "-C", staging]])
    expect(existsSync(managed)).toBe(true)
    expect(existsSync(staging)).toBe(false)
    expect(existsSync(uvStampPath(dir))).toBe(true)
  })
})

test("a download failure fails with a uv_unavailable error", async () => {
  await withTempDir(async (dir) => {
    const ensureUv = makeEnsureUv({
      home: dir,
      downloadFile: async () => err({ kind: "download_failed", detail: "HTTP 500" }),
      runProcess: neverRun,
    })

    const result = await ensureUv()

    expect(result).toEqual({ ok: false, error: { kind: "uv_unavailable", detail: "HTTP 500" } })
  })
})

test("an extraction failure fails with the exit detail and leaves no staging dir", async () => {
  await withTempDir(async (dir) => {
    const ensureUv = makeEnsureUv({
      home: dir,
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
    expect(existsSync(join(dir, "tools", "uv-0.9.18.staging"))).toBe(false)
  })
})

test("an extract that does not produce the binary fails and stamps nothing", async () => {
  await withTempDir(async (dir) => {
    const ensureUv = makeEnsureUv({
      home: dir,
      downloadFile: async (request) => ok({ path: request.destPath, bytes: 0 }),
      runProcess: async () => ({ exitCode: 0, stdout: "", stderrTail: "" }),
    })

    const result = await ensureUv()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("uv_unavailable")
    expect(result.error.detail).toContain("uv-0.9.18")
    expect(existsSync(uvStampPath(dir))).toBe(false)
    expect(existsSync(join(dir, "tools", "uv-0.9.18"))).toBe(false)
  })
})

test("an extractor that cannot start fails cleanly", async () => {
  await withTempDir(async (dir) => {
    const ensureUv = makeEnsureUv({
      home: dir,
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
