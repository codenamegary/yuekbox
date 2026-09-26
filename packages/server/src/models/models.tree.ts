import { err, ok, Result } from "../shared/result"
import { ModelDownloadFailure, ModelTreeFile } from "./models.models"
import { z } from "zod"

export const modelTreeUrl = (repo: string, revision: string): string =>
  `https://huggingface.co/api/models/${repo}/tree/${revision}?recursive=true`

export const modelFileUrl = (repo: string, revision: string, path: string): string =>
  `https://huggingface.co/${repo}/resolve/${revision}/${path}`

const sha256Pattern = /^[0-9a-f]{64}$/

/**
 * The Hugging Face tree API answer, one entry per repository item. The tree
 * is untrusted input even at a pinned revision, so it parses through a
 * schema and every field validates before the download trusts it.
 */
const TreeEntrySchema = z.looseObject({
  type: z.string(),
  path: z.string(),
  size: z.number().int().nonnegative(),
  lfs: z.looseObject({ oid: z.string().regex(sha256Pattern) }).nullish(),
})

/**
 * A repository path is only usable when it stays inside the download folder:
 * relative, no `..` segment, no backslash. Anything else fails the whole tree.
 */
const isSafeRepoPath = (path: string): boolean => {
  if (path === "" || path.startsWith("/") || path.includes("\\")) return false
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
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
    const parsed = TreeEntrySchema.safeParse(entry)
    if (!parsed.success) return invalidTree("a tree entry is not shaped like a repository item")
    const { type, path, size, lfs } = parsed.data
    if (type === "directory") continue
    if (type !== "file") return invalidTree(`the tree entry for ${path} is not a file`)
    if (!isSafeRepoPath(path)) return invalidTree(`the tree entry for ${path} is invalid`)
    files.push(Object.freeze({ path, sizeBytes: size, sha256: lfs?.oid ?? null }))
  }

  return ok(
    Object.freeze(
      files.toSorted((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      ),
    ),
  )
}
