import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, open, rename, stat, unlink } from "node:fs/promises"
import { dirname } from "node:path"
import { describeError } from "../shared/describe"
import { err, ok, Result } from "../shared/result"
import { ModelDownloadFailure } from "./models.models"
import { DownloadModelFile, ReadModelTree } from "./models.ports"
import { modelTreeUrl, parseModelTree } from "./models.tree"

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export const makeReadModelTree =
  (fetchImpl: FetchLike): ReadModelTree =>
  async (repo, revision, signal) => {
    const url = modelTreeUrl(repo, revision)
    try {
      const response = await fetchImpl(url, signal === undefined ? undefined : { signal })
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

/**
 * Verifies a complete part in place and gives it its final name. A part that
 * reaches full size but lost the race with a shutdown never needs a refetch;
 * wrong content is removed so the next start fetches fresh.
 */
const promotePart = async (
  partPath: string,
  request: Parameters<DownloadModelFile>[0],
): Promise<Result<number, ModelDownloadFailure>> => {
  if (request.sha256 !== null) {
    const hash = createHash("sha256")
    for await (const chunk of createReadStream(partPath)) hash.update(chunk)
    const actual = hash.digest("hex")
    if (actual !== request.sha256) {
      await unlink(partPath).catch(() => undefined)
      return err({ kind: "checksum_mismatch", detail: `expected ${request.sha256}, got ${actual}` })
    }
  }
  await rename(partPath, request.destPath)
  return ok(request.expectedBytes)
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
  let written = start // structure: allow-let
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
    // Keep the part: the bytes on disk are a valid prefix, and the next
    // attempt resumes from them instead of starting the file over.
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
 * A failed attempt keeps the `.part` so the next start resumes it, a part
 * that is already whole is verified in place instead of fetched again, and
 * content that failed verification is removed instead.
 */
export const makeDownloadModelFile =
  (fetchImpl: FetchLike): DownloadModelFile =>
  async (request) => {
    const partPath = `${request.destPath}.part`
    try {
      await mkdir(dirname(request.destPath), { recursive: true })
      const existing = await partBytes(partPath)
      if (existing === request.expectedBytes) {
        return await promotePart(partPath, request)
      }
      const resuming = existing > 0 && existing < request.expectedBytes
      if (existing > 0 && !resuming) await unlink(partPath)

      const init: RequestInit | undefined =
        request.signal === undefined && !resuming
          ? undefined
          : {
              ...(resuming ? { headers: { range: `bytes=${existing}-` } } : {}),
              ...(request.signal === undefined ? {} : { signal: request.signal }),
            }
      const response = await fetchImpl(request.url, init)
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
