import { AiConfig, AiConfigPatch } from "contracts/http/ai"
import { Result } from "../shared/result"
import { OpenAIError, StoredConfig, WriterSetting } from "./ai.models"

/** Wire-safe view: API keys replaced by hints. */
export type LoadConfig = () => Promise<AiConfig>

/** Full view including secrets, for server-side API calls only. */
export type LoadStoredConfig = () => Promise<StoredConfig>

export type SaveConfig = (patch: AiConfigPatch) => Promise<AiConfig>

export type ChatCompletion = (
  setting: WriterSetting,
  system: string,
  user: string,
  timeoutMs?: number,
) => Promise<Result<string, OpenAIError>>

export type ListModels = (
  setting: Pick<WriterSetting, "baseUrl" | "apiKey">,
) => Promise<Result<readonly string[], OpenAIError>>
