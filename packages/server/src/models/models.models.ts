import { MissingModel, ModelDownloadSnapshot, ModelKey, modelKeyOrder } from "contracts/http/models"

/** The five downloadable models, in report order; the same keys readiness uses. */
export const modelDownloadKeys = modelKeyOrder

export type ModelDownloadKey = ModelKey

export type { MissingModel, ModelDownloadSnapshot }

/**
 * A download larger than this asks for an explicit confirmation in the start
 * request. Every shipped model is far larger, so in practice the dialog always
 * confirms; the threshold keeps small test pins and future small models from
 * demanding a click.
 */
export const downloadConfirmationThresholdBytes = 128 * 1024 * 1024

/** One file in a pinned repository snapshot. `sha256` is the LFS object id when present. */
export type ModelTreeFile = Readonly<{
  path: string
  sizeBytes: number
  sha256: string | null
}>

export type ModelDownloadFailureKind =
  | "tree_fetch_failed"
  | "invalid_tree"
  | "manifest_mismatch"
  | "download_failed"
  | "checksum_mismatch"
  | "move_failed"

export type ModelDownloadFailure = Readonly<{
  kind: ModelDownloadFailureKind
  detail: string
}>

export type ModelDownloadJobState = "preparing" | "downloading" | "failed"

/**
 * A download the server would not start. The route maps these to problems:
 * an external path means "choose a folder", a missing confirmation carries
 * the bytes the user has to acknowledge.
 */
export type StartModelDownloadError =
  | Readonly<{ kind: "path_outside_home"; key: ModelDownloadKey; path: string }>
  | Readonly<{
      kind: "confirmation_required"
      key: ModelDownloadKey
      expectedBytes: number
      thresholdBytes: number
    }>

/**
 * Answers which of the models a generation needs are not on disk. The route
 * calls this before it creates a Song, so a blocked generation never leaves
 * a row.
 */
export type FindMissingGenerationModels = (
  input: Readonly<{ hasReference: boolean }>,
) => Promise<readonly MissingModel[]>
