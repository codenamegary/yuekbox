import { expect, test } from "bun:test"
import { MissingModel, ModelDownloads, ModelDownloadSnapshot } from "contracts/http/models"
import { Readiness } from "contracts/http/readiness"
import {
  activeDownloadKeys,
  blockedDetail,
  blockedTitle,
  downloadPercent,
  formatBytes,
  hasActiveDownload,
  modelRowViews,
  modelsReadyTitle,
  systemIssues,
} from "./models.view"

const readiness: Readiness = {
  models: {
    yue2: { state: "ready", path: "/mnt/models/YuE2-3B", size: 7_295_775_491 },
    yue2Vae: { state: "missing", path: "/home/you/.yuekbox/models/YuE2-Vae", size: 531_343_726 },
    sheetsage2: { state: "ready", path: "/mnt/models/SheetSage2", size: 233_240_091 },
    sheetsage2Base: {
      state: "missing",
      path: "/home/you/.yuekbox/models/MERT-v2-FullSong",
      size: 2_530_365_136,
    },
    whisper: {
      state: "missing",
      path: "/home/you/.yuekbox/models/whisper-large-v3-turbo",
      size: 1_622_466_054,
    },
  },
  system: {
    ffmpeg: { state: "ready" },
    nvidia: { state: "ready" },
  },
}

const snapshot = (overrides: Partial<ModelDownloadSnapshot>): ModelDownloadSnapshot => ({
  key: "yue2Vae",
  state: "idle",
  path: "/home/you/.yuekbox/models/YuE2-Vae",
  totalBytes: 531_343_726,
  bytesDone: 0,
  currentFile: null,
  ...overrides,
})

const downloads = (...items: readonly ModelDownloadSnapshot[]): ModelDownloads => [...items]

test("the five rows keep the report order and name the models the issue names", () => {
  const rows = modelRowViews(readiness, undefined)
  expect(rows.map((row) => row.key)).toEqual([
    "yue2",
    "yue2Vae",
    "sheetsage2",
    "sheetsage2Base",
    "whisper",
  ])
  expect(rows.map((row) => row.name)).toEqual([
    "YuE2-3B",
    "YuE2-Vae",
    "SheetSage2",
    "MERT-v2-FullSong",
    "Whisper large-v3-turbo",
  ])
})

test("a ready row carries its resolved path and bytes on disk", () => {
  const [yue2] = modelRowViews(readiness, undefined)
  expect(yue2).toEqual({
    key: "yue2",
    name: "YuE2-3B",
    job: "writes the song",
    state: "ready",
    path: "/mnt/models/YuE2-3B",
    sizeBytes: 7_295_775_491,
    active: false,
    percent: null,
    currentFile: null,
    downloadError: null,
  })
})

test("a missing row carries the download size the server expects", () => {
  const rows = modelRowViews(readiness, undefined)
  expect(rows[1]?.state).toBe("missing")
  expect(rows[1]?.sizeBytes).toBe(531_343_726)
})

test("a downloading row exposes progress and the file in flight", () => {
  const rows = modelRowViews(
    readiness,
    downloads(
      snapshot({
        state: "downloading",
        bytesDone: 132_835_931,
        currentFile: "model-00001-of-00015.safetensors",
      }),
    ),
  )
  expect(rows[1]?.percent).toBe(24)
  expect(rows[1]?.active).toBe(true)
  expect(rows[1]?.currentFile).toBe("model-00001-of-00015.safetensors")
})

test("a failed download keeps its detail on the row", () => {
  const rows = modelRowViews(
    readiness,
    downloads(snapshot({ state: "failed", errorDetail: "the connection dropped" })),
  )
  expect(rows[1]?.downloadError).toBe("the connection dropped")
  expect(rows[1]?.percent).toBeNull()
})

test("progress is a floored, clamped percent only while a download is active", () => {
  expect(downloadPercent(undefined)).toBeNull()
  expect(downloadPercent(snapshot({ state: "idle" }))).toBeNull()
  expect(downloadPercent(snapshot({ state: "present" }))).toBeNull()
  expect(downloadPercent(snapshot({ state: "failed" }))).toBeNull()
  expect(downloadPercent(snapshot({ state: "preparing" }))).toBeNull()
  expect(downloadPercent(snapshot({ state: "downloading", bytesDone: 1, totalBytes: 3 }))).toBe(33)
  expect(downloadPercent(snapshot({ state: "downloading", bytesDone: 9, totalBytes: 9 }))).toBe(100)
  expect(downloadPercent(snapshot({ state: "downloading", bytesDone: 99, totalBytes: 10 }))).toBe(
    100,
  )
})

test("polling stops when nothing is in flight", () => {
  expect(hasActiveDownload(undefined)).toBe(false)
  expect(hasActiveDownload(downloads(snapshot({ state: "idle" })))).toBe(false)
  expect(hasActiveDownload(downloads(snapshot({ state: "present" })))).toBe(false)
  expect(hasActiveDownload(downloads(snapshot({ state: "failed" })))).toBe(false)
  expect(hasActiveDownload(downloads(snapshot({ state: "preparing" })))).toBe(true)
  expect(hasActiveDownload(downloads(snapshot({ state: "downloading" })))).toBe(true)
})

test("the active keys change when one download finishes and another runs on", () => {
  expect(activeDownloadKeys(undefined)).toEqual([])
  expect(
    activeDownloadKeys(
      downloads(
        snapshot({ key: "yue2", state: "downloading" }),
        snapshot({ key: "yue2Vae", state: "present" }),
        snapshot({ key: "sheetsage2", state: "preparing" }),
      ),
    ),
  ).toEqual(["yue2", "sheetsage2"])
})

test("sizes read as the row copy does", () => {
  expect(formatBytes(0)).toBe("0 B")
  expect(formatBytes(512)).toBe("512 B")
  expect(formatBytes(7_295_775_491)).toBe("6.8 GB")
  expect(formatBytes(531_343_726)).toBe("506.7 MB")
  expect(formatBytes(1_622_466_054)).toBe("1.5 GB")
})

test("the system line is empty when both checks pass", () => {
  expect(systemIssues(readiness.system)).toEqual([])
})

test("a missing prerequisite carries its message and both fixes verbatim", () => {
  const issues = systemIssues({
    ffmpeg: {
      state: "missing",
      message: "ffmpeg with MP3 support is not installed.",
      fix: {
        linux: "sudo apt install ffmpeg",
        wsl2: "sudo apt update && sudo apt install ffmpeg",
      },
    },
    nvidia: { state: "ready" },
  })

  expect(issues).toEqual([
    {
      id: "ffmpeg",
      message: "ffmpeg with MP3 support is not installed.",
      fix: {
        linux: "sudo apt install ffmpeg",
        wsl2: "sudo apt update && sudo apt install ffmpeg",
      },
    },
  ])
})

test("the system line waits for readiness instead of inventing a state", () => {
  expect(systemIssues(undefined)).toEqual([])
})

const missing = (key: MissingModel["key"], name: string, downloadable = true): MissingModel => ({
  key,
  name,
  path: `/home/you/.yuekbox/models/${name}`,
  sizeBytes: 1,
  downloadable,
})

test("one missing model names itself and says why it is needed", () => {
  expect(blockedTitle([missing("yue2Vae", "YuE2-Vae")])).toBe("YuE2-Vae is missing")
  expect(blockedDetail([missing("yue2Vae", "YuE2-Vae")])).toBe(
    "yuekbox needs it to turn the song into audio.",
  )
})

test("several missing models are counted, not listed", () => {
  const models = [
    missing("yue2", "YuE2-3B"),
    missing("yue2Vae", "YuE2-Vae"),
    missing("sheetsage2", "SheetSage2"),
    missing("sheetsage2Base", "MERT-v2-FullSong"),
  ]
  expect(blockedTitle(models)).toBe("4 models are missing")
  expect(blockedDetail(models)).toBe("yuekbox needs them before it can start this song.")
})

test("a resolved prompt says the model is ready", () => {
  expect(modelsReadyTitle([missing("yue2", "YuE2-3B")])).toBe("YuE2-3B is ready")
  expect(modelsReadyTitle([missing("yue2", "YuE2-3B"), missing("yue2Vae", "YuE2-Vae")])).toBe(
    "All models are ready",
  )
})
