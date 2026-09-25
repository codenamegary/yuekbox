import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises"
import { readFile } from "node:fs/promises"
import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeDownloadModelFile, makeReadModelTree, FetchLike } from "./models.hf.adapters"

// SHA-256 of the ASCII bytes "hello". An independent literal, not recomputed
// from the bytes by the same code path the adapter uses.
const hello = new TextEncoder().encode("hello")
const helloSha256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"

const withTempDir = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "yuekbox-models-hf-"))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test("reads a repository tree from the pinned revision", async () => {
  const seen: string[] = []
  const readModelTree = makeReadModelTree(async (url) => {
    seen.push(url)
    return Response.json([
      { type: "directory", path: "assets", size: 0 },
      { type: "file", path: "config.json", size: 959 },
      { type: "file", path: "model.safetensors", size: 7, lfs: { oid: "a".repeat(64) } },
    ])
  })

  const result = await readModelTree("m-a-p/YuE2-3B", "rev1")

  expect(seen).toEqual(["https://huggingface.co/api/models/m-a-p/YuE2-3B/tree/rev1?recursive=true"])
  expect(result).toEqual({
    ok: true,
    value: [
      { path: "config.json", sizeBytes: 959, sha256: null },
      { path: "model.safetensors", sizeBytes: 7, sha256: "a".repeat(64) },
    ],
  })
})

test("an HTTP failure or a network throw is a tree fetch failure", async () => {
  const failing = makeReadModelTree(async () => new Response("nope", { status: 500 }))
  const throwing = makeReadModelTree(async () => {
    throw new Error("getaddrinfo ENOTFOUND")
  })

  for (const readModelTree of [failing, throwing]) {
    const result = await readModelTree("m-a-p/YuE2-3B", "rev1")
    expect(result.ok).toBe(false)
    if (result.ok) continue
    expect(result.error.kind).toBe("tree_fetch_failed")
  }
})

test("downloads a file, verifies its size and SHA-256, and reports progress", async () => {
  await withTempDir(async (dir) => {
    const dest = join(dir, "nested", "model.safetensors")
    const progress: number[] = []
    const downloadFile = makeDownloadModelFile(async () => new Response(hello))

    const result = await downloadFile({
      url: "https://huggingface.co/m-a-p/YuE2-3B/resolve/rev1/model.safetensors",
      destPath: dest,
      expectedBytes: hello.byteLength,
      sha256: helloSha256,
      onBytes: (written) => progress.push(written),
    })

    expect(result).toEqual({ ok: true, value: 5 })
    expect(progress.at(-1)).toBe(5)
    expect(new Uint8Array(await readFile(dest))).toEqual(hello)
    expect(await Bun.file(`${dest}.part`).exists()).toBe(false)
  })
})

test("a checksum mismatch or an HTTP failure leaves no file at the destination", async () => {
  await withTempDir(async (dir) => {
    const dest = join(dir, "model.safetensors")
    const request = {
      url: "https://huggingface.co/m-a-p/YuE2-3B/resolve/rev1/model.safetensors",
      destPath: dest,
      expectedBytes: 5,
      onBytes: () => {},
    }

    const mismatch = await makeDownloadModelFile(async () => new Response(hello))({
      ...request,
      sha256: "0".repeat(64),
    })
    expect(mismatch.ok).toBe(false)
    if (!mismatch.ok) expect(mismatch.error.kind).toBe("checksum_mismatch")
    expect(await Bun.file(dest).exists()).toBe(false)

    const failed = await makeDownloadModelFile(async () => new Response("nope", { status: 503 }))({
      ...request,
      sha256: null,
    })
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error.kind).toBe("download_failed")
    expect(await Bun.file(dest).exists()).toBe(false)
  })
})

test("resumes a partial file with a range request and appends the rest", async () => {
  await withTempDir(async (dir) => {
    const dest = join(dir, "model.safetensors")
    await writeFile(`${dest}.part`, "he")
    const seen: RequestInit[] = []
    const progress: number[] = []
    const fetchImpl: FetchLike = async (_url, init) => {
      seen.push(init ?? {})
      return new Response("llo", { status: 206 })
    }

    const result = await makeDownloadModelFile(fetchImpl)({
      url: "https://huggingface.co/openai/whisper-large-v3-turbo/resolve/rev1/vocab.json",
      destPath: dest,
      expectedBytes: 5,
      sha256: helloSha256,
      onBytes: (written) => progress.push(written),
    })

    expect(result).toEqual({ ok: true, value: 5 })
    expect(seen[0]?.headers).toEqual({ range: "bytes=2-" })
    expect(progress.at(-1)).toBe(5)
    expect(await readFile(dest, "utf8")).toBe("hello")
  })
})

test("restarts from zero when the server ignores the range request", async () => {
  await withTempDir(async (dir) => {
    const dest = join(dir, "model.safetensors")
    await writeFile(`${dest}.part`, "he")
    const downloadFile = makeDownloadModelFile(async () => new Response(hello))

    const result = await downloadFile({
      url: "https://huggingface.co/m-a-p/YuE2-3B/resolve/rev1/model.safetensors",
      destPath: dest,
      expectedBytes: 5,
      sha256: null,
      onBytes: () => {},
    })

    expect(result).toEqual({ ok: true, value: 5 })
    expect(await readFile(dest, "utf8")).toBe("hello")
  })
})

test("replaces a partial file that is already larger than expected", async () => {
  await withTempDir(async (dir) => {
    const dest = join(dir, "model.safetensors")
    await mkdir(dir, { recursive: true })
    await writeFile(`${dest}.part`, "hello world")

    const result = await makeDownloadModelFile(async (_url, init) => {
      expect(init?.headers).toBeUndefined()
      return new Response(hello)
    })({
      url: "https://huggingface.co/m-a-p/YuE2-3B/resolve/rev1/model.safetensors",
      destPath: dest,
      expectedBytes: 5,
      sha256: null,
      onBytes: () => {},
    })

    expect(result).toEqual({ ok: true, value: 5 })
    expect(await readFile(dest, "utf8")).toBe("hello")
  })
})
