import {
  AiConfig,
  AiConfigPatch,
  AiConfigSchema,
  aiConfigPath,
  aiEnhancePath,
  aiModelsPath,
  aiPresetsPath,
  aiRandomSongPath,
  AiModels,
  AiModelsSchema,
  AiPresets,
  AiPresetsSchema,
  EnhanceBody,
  EnhanceResult,
  EnhanceResultSchema,
  EnhanceScope,
  WriterScope,
} from "contracts/http/ai"
import { Song, SongSchema } from "contracts/http/songs"
import { ProblemDetailsSchema } from "contracts/http/error"

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const problem = ProblemDetailsSchema.safeParse(await response.json())
    if (problem.success) {
      return problem.data.detail ?? problem.data.title
    }
  } catch {
    // fall through to a generic message
  }
  return `Request failed with status ${response.status}`
}

const parseJson = async <T>(response: Response, parse: (value: unknown) => T): Promise<T> => {
  if (!response.ok) {
    throw new Error(await toErrorMessage(response))
  }
  return parse(await response.json())
}

export const fetchAiPresets = async (): Promise<AiPresets> => {
  const response = await fetch(aiPresetsPath)
  return parseJson(response, (value) => AiPresetsSchema.parse(value))
}

export const fetchAiConfig = async (): Promise<AiConfig> => {
  const response = await fetch(aiConfigPath)
  return parseJson(response, (value) => AiConfigSchema.parse(value))
}

export const saveAiConfig = async (patch: AiConfigPatch): Promise<AiConfig> => {
  const response = await fetch(aiConfigPath, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  })
  return parseJson(response, (value) => AiConfigSchema.parse(value))
}

export const fetchAiModels = async (scope: WriterScope): Promise<AiModels> => {
  const response = await fetch(`${aiModelsPath}?scope=${scope}`)
  return parseJson(response, (value) => AiModelsSchema.parse(value))
}

export const enhanceText = async (body: EnhanceBody): Promise<EnhanceResult> => {
  const response = await fetch(aiEnhancePath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return parseJson(response, (value) => EnhanceResultSchema.parse(value))
}

export const createRandomSong = async (): Promise<Song> => {
  const response = await fetch(aiRandomSongPath, { method: "POST" })
  return parseJson(response, (value) => SongSchema.parse(value))
}

export type EnhanceRequest = Readonly<{ kind: EnhanceScope; style: string; lyrics: string }>
