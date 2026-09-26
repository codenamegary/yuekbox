import { afterEach, expect, test } from "bun:test"
import { PROBLEM_TYPES } from "contracts/http/error"
import {
  fetchModelDownloads,
  fetchReadiness,
  saveModelPath,
  startModelDownload,
} from "./models.api"
import { downloadRefusalFromError } from "./models.problems"

type RecordedCall = Readonly<{ url: string; method: string; body: unknown }>

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const urlOf = (input: Parameters<typeof fetch>[0]): string => {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

const stubFetch = (respond: (call: RecordedCall) => Response): { calls: RecordedCall[] } => {
  const calls: RecordedCall[] = []
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = init?.body
    const call: RecordedCall = {
      url: urlOf(input),
      method: init?.method ?? "GET",
      body: typeof body === "string" ? JSON.parse(body) : null,
    }
    calls.push(call)
    return respond(call)
  }) as typeof fetch
  return { calls }
}

const readiness = {
  models: {
    yue2: { state: "missing", path: "/home/you/.yuekbox/models/YuE2-3B", size: 7_295_775_491 },
    yue2Vae: { state: "missing", path: "/home/you/.yuekbox/models/YuE2-Vae", size: 531_343_726 },
    sheetsage2: { state: "ready", path: "/mnt/SheetSage2", size: 233_240_091 },
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
  system: { ffmpeg: { state: "ready" }, nvidia: { state: "ready" } },
}

const snapshot = {
  key: "yue2Vae",
  state: "downloading",
  path: "/home/you/.yuekbox/models/YuE2-Vae",
  totalBytes: 531_343_726,
  bytesDone: 132_835_931,
  currentFile: "model-00001-of-00002.safetensors",
}

test("readiness is read from the server and parsed with the contract", async () => {
  const stub = stubFetch(() => Response.json(readiness))
  const report = await fetchReadiness()
  expect(stub.calls).toEqual([{ url: "/v1/readiness", method: "GET", body: null }])
  expect(report.models.yue2.state).toBe("missing")
  expect(report.system.nvidia.state).toBe("ready")
})

test("the downloads poll reads all five snapshots", async () => {
  const stub = stubFetch(() => Response.json([snapshot]))
  const report = await fetchModelDownloads()
  expect(stub.calls[0]?.url).toBe("/v1/models/downloads")
  expect(report[0]?.currentFile).toBe("model-00001-of-00002.safetensors")
})

test("a download starts with the user's confirmation in the body", async () => {
  const stub = stubFetch(() => Response.json(snapshot, { status: 202 }))
  const result = await startModelDownload("yue2Vae", true)
  expect(stub.calls[0]?.url).toBe("/v1/models/yue2Vae/download")
  expect(stub.calls[0]?.method).toBe("POST")
  expect(stub.calls[0]?.body).toEqual({ confirm: true })
  expect(result.state).toBe("downloading")
})

test("a refused download arrives as its problem, bytes and all", async () => {
  stubFetch(() =>
    Response.json(
      {
        type: PROBLEM_TYPES.confirmationRequired,
        title: "Download Confirmation Required",
        status: 409,
        expectedBytes: 7_295_775_491,
        thresholdBytes: 134_217_728,
      },
      { status: 409 },
    ),
  )

  const error = await startModelDownload("yue2", false).catch((thrown: unknown) => thrown)
  expect(downloadRefusalFromError(error)).toEqual({
    kind: "confirmation-required",
    expectedBytes: 7_295_775_491,
  })
})

test("a path is written through the config endpoint as a partial patch", async () => {
  const stub = stubFetch(() =>
    Response.json({
      models: {
        yue2: "/home/codenamegary/sites/yue2/models/YuE2-3B",
        yue2Vae: "/mnt/old/YuE2-Vae",
        sheetsage2: "/mnt/old/SheetSage2",
        sheetsage2Base: "/mnt/old/MERT-v2-FullSong",
        whisper: "/mnt/old/whisper",
      },
    }),
  )

  const config = await saveModelPath("yue2", "/home/codenamegary/sites/yue2/models/YuE2-3B")

  expect(stub.calls[0]?.url).toBe("/v1/config")
  expect(stub.calls[0]?.method).toBe("PUT")
  expect(stub.calls[0]?.body).toEqual({
    models: { yue2: "/home/codenamegary/sites/yue2/models/YuE2-3B" },
  })
  expect(config.models.yue2).toBe("/home/codenamegary/sites/yue2/models/YuE2-3B")
})

test("a rejected path write surfaces the server's validation problem", async () => {
  stubFetch(() =>
    Response.json(
      {
        type: PROBLEM_TYPES.validationError,
        title: "Validation Error",
        status: 400,
        detail: "model paths failed validation",
        errors: [{ pointer: "/models/yue2", code: "too_small" }],
      },
      { status: 400 },
    ),
  )

  const error = await saveModelPath("yue2", "").catch((thrown: unknown) => thrown)
  expect((error as Error).message).toBe("model paths failed validation")
})
