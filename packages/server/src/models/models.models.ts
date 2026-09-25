/** The five downloadable models, in report order; the same keys readiness uses. */
export const modelDownloadKeys = Object.freeze([
  "yue2",
  "yue2Vae",
  "sheetsage2",
  "sheetsage2Base",
  "whisper",
] as const)

export type ModelDownloadKey = (typeof modelDownloadKeys)[number]

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

/** What the routes serve: one model's state plus enough to draw progress. */
export type ModelDownloadSnapshot = Readonly<{
  key: ModelDownloadKey
  state: "idle" | "preparing" | "downloading" | "failed" | "present"
  path: string
  totalBytes: number
  bytesDone: number
  currentFile: string | null
  errorDetail?: string
}>

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

/** A model a generation needs that is not on disk. */
export type MissingModel = Readonly<{
  key: ModelDownloadKey
  name: string
  path: string
  sizeBytes: number
  downloadable: boolean
}>

/**
 * Answers which of the models a generation needs are missing. The route calls
 * this before it creates a Song, so a blocked generation never leaves a row.
 */
export type FindMissingGenerationModels = (
  input: Readonly<{ hasReference: boolean }>,
) => Promise<readonly MissingModel[]>
