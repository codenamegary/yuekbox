import { Config, ConfigPatch, ConfigSchema, configPath } from "contracts/http/config"
import {
  ModelDownloads,
  ModelDownloadsSchema,
  ModelDownloadSnapshot,
  ModelDownloadSnapshotSchema,
  ModelKey,
  modelDownloadPath,
  modelsDownloadsPath,
} from "contracts/http/models"
import { Readiness, ReadinessSchema, readinessPath } from "contracts/http/readiness"
import { parseJson } from "@/lib/http"

export const fetchReadiness = async (): Promise<Readiness> => {
  const response = await fetch(readinessPath)
  return parseJson(response, (value) => ReadinessSchema.parse(value))
}

export const fetchModelDownloads = async (): Promise<ModelDownloads> => {
  const response = await fetch(modelsDownloadsPath)
  return parseJson(response, (value) => ModelDownloadsSchema.parse(value))
}

/** Starts or resumes a download. Every shipped model needs `confirm: true`. */
export const startModelDownload = async (
  key: ModelKey,
  confirm: boolean,
): Promise<ModelDownloadSnapshot> => {
  const response = await fetch(modelDownloadPath(key), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm }),
  })
  return parseJson(response, (value) => ModelDownloadSnapshotSchema.parse(value))
}

/** Writes one model path; the server validates it and answers with all five. */
export const saveModelPath = async (key: ModelKey, path: string): Promise<Config> => {
  const patch: ConfigPatch = { models: { [key]: path } }
  const response = await fetch(configPath, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  })
  return parseJson(response, (value) => ConfigSchema.parse(value))
}
