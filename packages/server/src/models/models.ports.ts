import { Result } from "../shared/result"
import { ModelDownloadFailure, ModelTreeFile } from "./models.models"

/** Lists a pinned repository revision's files. The only tree network seam. */
export type ReadModelTree = (
  repo: string,
  revision: string,
) => Promise<Result<readonly ModelTreeFile[], ModelDownloadFailure>>

export type ModelFileDownloadRequest = Readonly<{
  url: string
  destPath: string
  expectedBytes: number
  /** The LFS SHA-256, when the repository stores the file in LFS. */
  sha256: string | null
  /** Cumulative bytes of this file on disk, called as chunks land. */
  onBytes: (written: number) => void
}>

/** Fetches one file, resuming from a partial `.part` when one exists. */
export type DownloadModelFile = (
  request: ModelFileDownloadRequest,
) => Promise<Result<number, ModelDownloadFailure>>

/** True when the path exists, file or directory. Cheap: one stat. */
export type PathExists = (path: string) => Promise<boolean>

export type EnsureDirectory = (path: string) => Promise<void>

/** Atomic same-filesystem rename: a model only appears once it is whole. */
export type MoveDirectory = (from: string, to: string) => Promise<void>

export type RemoveDirectory = (path: string) => Promise<void>

/** Bytes of an existing regular file, or null when it is missing or a directory. */
export type MeasureFileBytes = (path: string) => Promise<number | null>
