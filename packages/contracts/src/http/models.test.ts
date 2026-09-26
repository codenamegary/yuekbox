import { expect, test } from "bun:test"
import {
  MissingModelSchema,
  ModelDownloadSnapshotSchema,
  ModelDownloadStartSchema,
  ModelDownloadsSchema,
  modelDownloadPath,
  modelsDownloadsPath,
} from "./models"

const snapshot = {
  key: "yue2" as const,
  state: "downloading" as const,
  path: "/home/u/.yuekbox/models/YuE2-3B",
  totalBytes: 7_295_775_491,
  bytesDone: 1_048_576,
  currentFile: "model.safetensors",
}

test("exposes the model download paths", () => {
  expect(modelsDownloadsPath).toBe("/v1/models/downloads")
  expect(modelDownloadPath("yue2")).toBe("/v1/models/yue2/download")
})

test("parses a downloading snapshot", () => {
  expect(ModelDownloadSnapshotSchema.parse(snapshot)).toEqual(snapshot)
})

test("parses a failed snapshot with a detail", () => {
  const failed = { ...snapshot, state: "failed" as const, errorDetail: "the network dropped" }
  expect(ModelDownloadSnapshotSchema.parse(failed)).toEqual(failed)
})

test("rejects a failed snapshot without a detail and an unknown key or state", () => {
  expect(ModelDownloadSnapshotSchema.safeParse({ ...snapshot, state: "failed" }).success).toBe(
    false,
  )
  expect(ModelDownloadSnapshotSchema.safeParse({ ...snapshot, key: "yue2xl" }).success).toBe(false)
  expect(ModelDownloadSnapshotSchema.safeParse({ ...snapshot, state: "running" }).success).toBe(
    false,
  )
  expect(
    ModelDownloadSnapshotSchema.safeParse({ ...snapshot, bytesDone: snapshot.totalBytes + 1 })
      .success,
  ).toBe(false)
})

test("a download start defaults to no confirmation and rejects unknown fields", () => {
  expect(ModelDownloadStartSchema.parse({})).toEqual({ confirm: false })
  expect(ModelDownloadStartSchema.parse({ confirm: true })).toEqual({ confirm: true })
  expect(ModelDownloadStartSchema.safeParse({ confirm: true, force: true }).success).toBe(false)
  expect(ModelDownloadStartSchema.safeParse({ confirm: "yes" }).success).toBe(false)
})

test("lists download snapshots as a bare array", () => {
  const list = [snapshot]
  expect(ModelDownloadsSchema.parse(list)).toEqual(list)
  expect(ModelDownloadsSchema.safeParse({ items: [snapshot] }).success).toBe(false)
})

test("parses a missing model with its size and expected path", () => {
  const missing = {
    key: "sheetsage2Base" as const,
    name: "MERT-v2-FullSong",
    path: "/mnt/audio/MERT-v2-FullSong",
    sizeBytes: 2_530_365_136,
    downloadable: false,
  }
  expect(MissingModelSchema.parse(missing)).toEqual(missing)
  expect(MissingModelSchema.safeParse({ ...missing, sizeBytes: 0 }).success).toBe(false)
  expect(MissingModelSchema.safeParse({ ...missing, downloadable: "no" }).success).toBe(false)
})
