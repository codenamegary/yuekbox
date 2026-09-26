import { MissingModel, modelDownloadKeys } from "./models.models"
import { ModelsSlice } from "./models.assembly"

const snapshot = (key: (typeof modelDownloadKeys)[number], path: string) =>
  Object.freeze({
    key,
    state: "idle" as const,
    path,
    totalBytes: 0,
    bytesDone: 0,
    currentFile: null,
  })

/**
 * A models slice for tests that mount the routes but never download: idle
 * snapshots and no missing models. The real slice is assembled in compose.
 */
export const unusedModelsFixture = (): ModelsSlice => {
  const idle = modelDownloadKeys.map((key) => snapshot(key, `/tmp/yuekbox-unused-models/${key}`))
  return {
    downloads: {
      start: async ({ key }) => ({
        ok: true,
        value: idle.find((item) => item.key === key) ?? snapshot(key, ""),
      }),
      read: async (key) => idle.find((item) => item.key === key) ?? snapshot(key, ""),
      readAll: async () => Object.freeze(idle),
      drain: async () => {},
    },
    findMissingGenerationModels: async () => [],
  }
}

/** A fixture that reports every requested model missing, for dialog tests. */
export const missingModelsFixture = (missing: readonly MissingModel[]): ModelsSlice => ({
  ...unusedModelsFixture(),
  findMissingGenerationModels: async () => missing,
})
