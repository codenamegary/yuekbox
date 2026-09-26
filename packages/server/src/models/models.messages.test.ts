import { expect, test } from "bun:test"
import { downloadFailureMessage } from "./models.messages"
import { ModelDownloadFailure } from "./models.models"

test("every failure kind maps to a plain line with no raw error text in it", () => {
  const failures: readonly ModelDownloadFailure[] = [
    {
      kind: "tree_fetch_failed",
      detail: "GET https://huggingface.co/api/models/x failed with HTTP 503",
    },
    { kind: "invalid_tree", detail: "unexpected shape" },
    { kind: "manifest_mismatch", detail: "the pinned revision lists 6 bytes, the manifest pins 5" },
    { kind: "download_failed", detail: "expected 5 bytes, wrote 2" },
    {
      kind: "checksum_mismatch",
      detail: "expected 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824, got aaa",
    },
    { kind: "move_failed", detail: "ENOSPC: no space left on device" },
  ]

  const leaked = /huggingface\.co|https?:\/\/|[0-9a-f]{64}|HTTP \d|ENOSPC/

  for (const failure of failures) {
    const message = downloadFailureMessage(failure)
    expect(message.length).toBeGreaterThan(0)
    expect(message).not.toMatch(leaked)
  }
})

test("an interrupted download says so, and a checksum failure names the cause", () => {
  expect(downloadFailureMessage({ kind: "download_failed", detail: "x" })).toBe(
    "the download was interrupted",
  )
  expect(downloadFailureMessage({ kind: "checksum_mismatch", detail: "x" })).toBe(
    "the downloaded file did not match this model's pinned checksum",
  )
})
