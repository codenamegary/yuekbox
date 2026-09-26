import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeDownloadFile } from "./provisioning.download.adapters"

// SHA-256 of the ASCII bytes "hello". An independent literal, not recomputed
// from the bytes by the same code path the adapter uses.
const hello = new TextEncoder().encode("hello")
const helloSha256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"

const withTempDir = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "yuekbox-download-test-"))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test("writes the file at the destination after the checksum matches", async () => {
  await withTempDir(async (dir) => {
    const dest = join(dir, "uv.tar.gz")
    const downloadFile = makeDownloadFile(async () => new Response(hello))

    const result = await downloadFile({
      url: "https://example.com/uv.tar.gz",
      destPath: dest,
      sha256: helloSha256,
    })

    expect(result).toEqual({ ok: true, value: { path: dest, bytes: 5 } })
    expect(new Uint8Array(await readFile(dest))).toEqual(hello)
    expect(existsSync(`${dest}.part`)).toBe(false)
  })
})

test("a checksum mismatch fails and leaves nothing at the destination", async () => {
  await withTempDir(async (dir) => {
    const dest = join(dir, "uv.tar.gz")
    const downloadFile = makeDownloadFile(async () => new Response(hello))

    const result = await downloadFile({
      url: "https://example.com/uv.tar.gz",
      destPath: dest,
      sha256: "0".repeat(64),
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("checksum_mismatch")
    expect(result.error.detail).toContain(helloSha256)
    expect(existsSync(dest)).toBe(false)
    expect(existsSync(`${dest}.part`)).toBe(false)
  })
})

test("an HTTP failure is a download failure", async () => {
  await withTempDir(async (dir) => {
    const dest = join(dir, "uv.tar.gz")
    const downloadFile = makeDownloadFile(async () => new Response("nope", { status: 503 }))

    const result = await downloadFile({
      url: "https://example.com/uv.tar.gz",
      destPath: dest,
      sha256: helloSha256,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("download_failed")
    expect(result.error.detail).toContain("503")
    expect(existsSync(dest)).toBe(false)
  })
})

test("a network throw is a download failure", async () => {
  await withTempDir(async (dir) => {
    const dest = join(dir, "uv.tar.gz")
    const downloadFile = makeDownloadFile(async () => {
      throw new Error("getaddrinfo ENOTFOUND")
    })

    const result = await downloadFile({
      url: "https://example.com/uv.tar.gz",
      destPath: dest,
      sha256: helloSha256,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("download_failed")
    expect(existsSync(dest)).toBe(false)
  })
})

test("the requested url is the one fetched", async () => {
  await withTempDir(async (dir) => {
    const seen: string[] = []
    const downloadFile = makeDownloadFile(async (url) => {
      seen.push(url)
      return new Response(hello)
    })

    await downloadFile({
      url: "https://example.com/archive.tar.gz",
      destPath: join(dir, "archive.tar.gz"),
      sha256: helloSha256,
    })

    expect(seen).toEqual(["https://example.com/archive.tar.gz"])
  })
})
