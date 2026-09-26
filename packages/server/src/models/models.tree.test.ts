import { expect, test } from "bun:test"
import { modelFileUrl, modelTreeUrl, parseModelTree } from "./models.tree"

test("builds the pinned tree and file URLs", () => {
  expect(modelTreeUrl("m-a-p/YuE2-3B", "abc123")).toBe(
    "https://huggingface.co/api/models/m-a-p/YuE2-3B/tree/abc123?recursive=true",
  )
  expect(modelFileUrl("m-a-p/YuE2-3B", "abc123", "nested/model.safetensors")).toBe(
    "https://huggingface.co/m-a-p/YuE2-3B/resolve/abc123/nested/model.safetensors",
  )
})

const lfsOid = "1d55c42c1a9875c34f5d736e15078449992b044e807ce2a138e6cf289a1e59e9"

test("maps files to paths, sizes, and LFS checksums and drops directories", () => {
  const parsed = parseModelTree([
    { type: "directory", path: "assets", size: 0 },
    { type: "file", path: "README.md", size: 20190 },
    {
      type: "file",
      path: "model.safetensors",
      size: 7_261_441_640,
      lfs: { oid: lfsOid, size: 100 },
    },
  ])

  expect(parsed).toEqual({
    ok: true,
    value: [
      { path: "README.md", sizeBytes: 20190, sha256: null },
      { path: "model.safetensors", sizeBytes: 7_261_441_640, sha256: lfsOid },
    ],
  })
})

test("rejects repo paths that escape the download folder", () => {
  const escaping = parseModelTree([
    { type: "file", path: "../outside.bin", size: 1 },
    { type: "file", path: "/etc/passwd", size: 1 },
    { type: "file", path: "nested/../../outside.bin", size: 1 },
    { type: "file", path: "windows\\style.bin", size: 1 },
  ])

  expect(escaping.ok).toBe(false)
})

test("rejects a malformed tree instead of guessing", () => {
  for (const payload of [
    { not: "an array" },
    [{ type: "file", path: "x.bin", size: "big" }],
    [{ type: "file", path: "x.bin", size: -1 }],
    [{ type: "file", size: 1 }],
    [{ type: "file", path: "x.bin", size: 1, lfs: { oid: "not-a-sha" } }],
  ]) {
    expect(parseModelTree(payload).ok).toBe(false)
  }
})
