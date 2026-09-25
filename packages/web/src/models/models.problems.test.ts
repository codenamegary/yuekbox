import { expect, test } from "bun:test"
import { PROBLEM_TYPES } from "contracts/http/error"
import { MissingModel } from "contracts/http/models"
import { blockedModelsFromError, downloadRefusalFromError } from "./models.problems"

const missingModels: readonly MissingModel[] = [
  {
    key: "yue2",
    name: "YuE2-3B",
    path: "/home/you/.yuekbox/models/YuE2-3B",
    sizeBytes: 7_295_775_491,
    downloadable: true,
  },
  {
    key: "yue2Vae",
    name: "YuE2-Vae",
    path: "/mnt/audio/YuE2-Vae",
    sizeBytes: 531_343_726,
    downloadable: false,
  },
]

const modelRequired = {
  type: PROBLEM_TYPES.modelRequired,
  title: "Model Required",
  status: 409,
  detail: "generation needs models that are not on disk",
  models: missingModels,
}

test("a blocked generation surfaces every missing model the server named", () => {
  const error = new Error("blocked", { cause: modelRequired })
  expect(blockedModelsFromError(error)).toEqual(missingModels)
})

test("only a model-required problem blocks a generation", () => {
  const conflict = new Error("no", {
    cause: { type: PROBLEM_TYPES.conflict, title: "Conflict", status: 409 },
  })
  expect(blockedModelsFromError(conflict)).toBeNull()
  expect(blockedModelsFromError(new Error("plain"))).toBeNull()
})

test("a download refusal carries the bytes the user must confirm", () => {
  const refusal = downloadRefusalFromError(
    new Error("confirm", {
      cause: {
        type: PROBLEM_TYPES.confirmationRequired,
        title: "Download Confirmation Required",
        status: 409,
        expectedBytes: 7_295_775_491,
        thresholdBytes: 134_217_728,
      },
    }),
  )
  expect(refusal).toEqual({ kind: "confirmation-required", expectedBytes: 7_295_775_491 })
})

test("a refused external path points back at the path input", () => {
  const refusal = downloadRefusalFromError(
    new Error("external", {
      cause: {
        type: PROBLEM_TYPES.modelPathExternal,
        title: "Model Path External",
        status: 409,
        key: "yue2Vae",
        path: "/mnt/audio/YuE2-Vae",
      },
    }),
  )
  expect(refusal).toEqual({
    kind: "external-path",
    key: "yue2Vae",
    path: "/mnt/audio/YuE2-Vae",
  })
})

test("an unrelated problem is not a download refusal", () => {
  expect(downloadRefusalFromError(new Error("plain"))).toBeNull()
  expect(downloadRefusalFromError(new Error("blocked", { cause: modelRequired }))).toBeNull()
})
