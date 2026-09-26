import { ModelDownloadFailure } from "./models.models"

/**
 * Turns a download stop into the one line a person sees in the model
 * manager. It names what happened in plain words and never leaks the raw
 * error: no repository URLs, no pinned checksums, no HTTP codes. The raw
 * detail stays in the server log.
 */
export const downloadFailureMessage = (failure: ModelDownloadFailure): string => {
  switch (failure.kind) {
    case "tree_fetch_failed":
      return "could not reach the model repository"
    case "invalid_tree":
      return "the model repository answered with an unexpected file list"
    case "manifest_mismatch":
      return "the repository no longer matches the pinned release of this model"
    case "download_failed":
      return "the download was interrupted"
    case "checksum_mismatch":
      return "the downloaded file did not match this model's pinned checksum"
    case "move_failed":
      return "the finished download could not be moved into place"
  }
}
