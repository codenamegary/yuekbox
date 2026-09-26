import { err, ok, Result } from "../shared/result"
import { ModelDownloadFailure, ModelTreeFile } from "./models.models"

export const modelTreeUrl = (repo: string, revision: string): string =>
  `https://huggingface.co/api/models/${repo}/tree/${revision}?recursive=true`

export const modelFileUrl = (repo: string, revision: string, path: string): string =>
  `https://huggingface.co/${repo}/resolve/${revision}/${path}`

const sha256Pattern = /^[0-9a-f]{64}$/

/**
 * A repository path is only usable when it stays inside the download folder:
 * relative, no `..` segment, no backslash. The upstream tree is untrusted
 * input even at a pinned revision, so anything else fails the whole tree.
 */
const isSafeRepoPath = (path: string): boolean => {
  if (path === "" || path.startsWith("/") || path.includes("\\")) return false
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
}

const toTreeFile = (entry: Record<string, unknown>): ModelTreeFile | null => {
  if (entry["type"] !== "file") return null
  const path = entry["path"]
  const size = entry["size"]
  if (typeof path !== "string" || !isSafeRepoPath(path)) return null
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) return null

  const lfs = entry["lfs"]
  if (lfs === undefined || lfs === null) return { path, sizeBytes: size, sha256: null }
  if (typeof lfs !== "object") return null
  const oid = (lfs as Record<string, unknown>)["oid"]
  if (typeof oid !== "string" || !sha256Pattern.test(oid)) return null
  return { path, sizeBytes: size, sha256: oid }
}

const invalidTree = (detail: string): Result<readonly ModelTreeFile[], ModelDownloadFailure> =>
  err({ kind: "invalid_tree", detail })

/**
 * Parses the Hugging Face tree API answer into the files a download fetches:
 * regular files only, validated paths, sizes, and the LFS SHA-256 when the
 * repository stores the file in LFS. Sorted by path so retries are stable.
 */
export const parseModelTree = (
  payload: unknown,
): Result<readonly ModelTreeFile[], ModelDownloadFailure> => {
  if (!Array.isArray(payload)) return invalidTree("the model tree is not an array")

  const files: ModelTreeFile[] = []
  for (const entry of payload) {
    if (typeof entry !== "object" || entry === null)
      return invalidTree("a tree entry is not an object")
    if ((entry as Record<string, unknown>)["type"] === "directory") continue
    const file = toTreeFile(entry as Record<string, unknown>)
    if (file === null) {
      const path = (entry as Record<string, unknown>)["path"]
      return invalidTree(`the tree entry for ${typeof path === "string" ? path : "?"} is invalid`)
    }
    files.push(Object.freeze(file))
  }

  return ok(
    Object.freeze(
      files.toSorted((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      ),
    ),
  )
}
