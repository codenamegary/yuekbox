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
import { toProblemError } from "@/lib/problems"

const parseJson = async <T>(response: Response, parse: (value: unknown) => T): Promise<T> => {
  if (!response.ok) throw await toProblemError(response)
  return parse(await response.json())
}

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

const pathPatch = (key: ModelKey, path: string): ConfigPatch => {
  switch (key) {
    case "yue2":
      return { models: { yue2: path } }
    case "yue2Vae":
      return { models: { yue2Vae: path } }
    case "sheetsage2":
      return { models: { sheetsage2: path } }
    case "sheetsage2Base":
      return { models: { sheetsage2Base: path } }
    case "whisper":
      return { models: { whisper: path } }
  }
}

/** Writes one model path; the server validates it and answers with all five. */
export const saveModelPath = async (key: ModelKey, path: string): Promise<Config> => {
  const response = await fetch(configPath, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pathPatch(key, path)),
  })
  return parseJson(response, (value) => ConfigSchema.parse(value))
}
