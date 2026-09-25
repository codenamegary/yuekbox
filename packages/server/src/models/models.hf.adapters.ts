import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, open, rename, stat, unlink } from "node:fs/promises"
import { dirname } from "node:path"
import { err, ok, Result } from "../shared/result"
import { ModelDownloadFailure } from "./models.models"
import { DownloadModelFile, ReadModelTree } from "./models.ports"
import { modelTreeUrl, parseModelTree } from "./models.tree"

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const makeReadModelTree =
  (fetchImpl: FetchLike): ReadModelTree =>
  async (repo, revision) => {
    const url = modelTreeUrl(repo, revision)
    try {
      const response = await fetchImpl(url)
      if (!response.ok) {
        return err({
          kind: "tree_fetch_failed",
          detail: `GET ${url} failed with HTTP ${response.status}`,
        })
      }
      return parseModelTree(await response.json())
    } catch (error: unknown) {
      return err({ kind: "tree_fetch_failed", detail: describeError(error) })
    }
  }

const partBytes = async (path: string): Promise<number> => {
  try {
    const stats = await stat(path)
    return stats.isFile() ? stats.size : 0
  } catch {
    return 0
  }
}

/** The response body is streamed; a multi-gigabyte file never sits in memory. */
const writeBody = async (
  response: Response,
  partPath: string,
  start: number,
  request: Parameters<DownloadModelFile>[0],
): Promise<Result<number, ModelDownloadFailure>> => {
  if (response.body === null) {
    return err({ kind: "download_failed", detail: "the response carried no body" })
  }

  const handle = await open(partPath, start > 0 ? "a" : "w")
  const hash = request.sha256 === null ? null : createHash("sha256")
  let written = start
  try {
    // A resumed part is hashed first, so the LFS checksum still covers the whole file.
    if (hash !== null && start > 0) {
      for await (const chunk of createReadStream(partPath)) hash.update(chunk)
    }
    for await (const chunk of response.body) {
      await handle.write(chunk)
      written += chunk.byteLength
      if (hash !== null) hash.update(chunk)
      request.onBytes(written)
    }
  } finally {
    await handle.close()
  }

  if (written !== request.expectedBytes) {
    await unlink(partPath).catch(() => undefined)
    return err({
      kind: "download_failed",
      detail: `expected ${request.expectedBytes} bytes, wrote ${written}`,
    })
  }

  if (hash !== null) {
    const actual = hash.digest("hex")
    if (actual !== request.sha256) {
      await unlink(partPath).catch(() => undefined)
      return err({ kind: "checksum_mismatch", detail: `expected ${request.sha256}, got ${actual}` })
    }
  }

  await rename(partPath, request.destPath)
  return ok(written)
}

/**
 * Streams one repository file to `<dest>.part`, resuming with an HTTP Range
 * request when a partial file is already there. Size is always checked and the
 * LFS SHA-256 is checked when the repository provides one; the file only takes
 * its final name after both pass, so a torn download never looks installed.
 * A failed attempt keeps the `.part` so the next start resumes it; content
 * that failed verification is removed instead.
 */
export const makeDownloadModelFile =
  (fetchImpl: FetchLike): DownloadModelFile =>
  async (request) => {
    const partPath = `${request.destPath}.part`
    try {
      await mkdir(dirname(request.destPath), { recursive: true })
      const existing = await partBytes(partPath)
      const resuming = existing > 0 && existing < request.expectedBytes
      if (existing > 0 && !resuming) await unlink(partPath)

      const response = await fetchImpl(
        request.url,
        resuming ? { headers: { range: `bytes=${existing}-` } } : undefined,
      )
      if (!response.ok) {
        return err({
          kind: "download_failed",
          detail: `GET ${request.url} failed with HTTP ${response.status}`,
        })
      }

      const start = resuming && response.status === 206 ? existing : 0
      return await writeBody(response, partPath, start, request)
    } catch (error: unknown) {
      return err({ kind: "download_failed", detail: describeError(error) })
    }
  }
