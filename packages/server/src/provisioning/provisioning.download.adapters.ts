import { createHash } from "node:crypto"
import { mkdir, rename, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { err, ok } from "../shared/result"
import { DownloadFile } from "./provisioning.ports"

export type FetchLike = (url: string) => Promise<Response>

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * The one network seam. Fetches a pinned artifact to `<dest>.part`, checks
 * its SHA-256 against the pin, and only then renames it onto the destination,
 * so a failed or tampered download never leaves a usable file behind.
 */
export const makeDownloadFile = (fetchImpl: FetchLike): DownloadFile => {
  return async (request) => {
    const partPath = `${request.destPath}.part`
    try {
      const response = await fetchImpl(request.url)
      if (!response.ok) {
        return err({
          kind: "download_failed",
          detail: `GET ${request.url} failed with HTTP ${response.status}`,
        })
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      const actual = createHash("sha256").update(bytes).digest("hex")
      if (actual !== request.sha256) {
        return err({
          kind: "checksum_mismatch",
          detail: `expected ${request.sha256}, got ${actual}`,
        })
      }
      await mkdir(dirname(request.destPath), { recursive: true })
      await writeFile(partPath, bytes)
      await rename(partPath, request.destPath)
      return ok({ path: request.destPath, bytes: bytes.byteLength })
    } catch (error: unknown) {
      return err({ kind: "download_failed", detail: describeError(error) })
    } finally {
      await unlink(partPath).catch(() => undefined)
    }
  }
}
