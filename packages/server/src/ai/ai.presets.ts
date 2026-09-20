import { Preset } from "contracts/http/ai"

export type KnownPreset = Readonly<{
  id: string
  name: string
  icon: string
  baseUrl: string
  needsKey: boolean
  defaultModels: readonly string[]
}>

/**
 * OpenAI-compatible endpoints we know about. The base URL is what the user
 * gets prefilled; the models list always comes from the live /models endpoint
 * when it can be fetched, and these defaults are only a fallback.
 */
export const knownPresets: readonly KnownPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "openai",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    defaultModels: ["gpt-5-mini", "gpt-4o-mini", "gpt-4o"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    needsKey: true,
    defaultModels: ["claude-sonnet-4-5", "claude-haiku-4-5"],
  },
  {
    id: "gemini",
    name: "Gemini",
    icon: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsKey: true,
    defaultModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    defaultModels: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4.5"],
  },
  {
    id: "groq",
    name: "Groq",
    icon: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    defaultModels: ["llama-3.3-70b-versatile"],
  },
  {
    id: "mistral",
    name: "Mistral",
    icon: "mistral",
    baseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
    defaultModels: ["mistral-large-latest", "mistral-small-latest"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    needsKey: true,
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "together",
    name: "Together",
    icon: "together",
    baseUrl: "https://api.together.xyz/v1",
    needsKey: true,
    defaultModels: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
  },
  {
    id: "ollama",
    name: "Ollama",
    icon: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    needsKey: false,
    defaultModels: [],
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    icon: "lmstudio",
    baseUrl: "http://127.0.0.1:1234/v1",
    needsKey: false,
    defaultModels: [],
  },
  {
    id: "custom",
    name: "Custom",
    icon: "custom",
    baseUrl: "",
    needsKey: false,
    defaultModels: [],
  },
]

export const presetById = (presetId: string): KnownPreset | undefined =>
  knownPresets.find((preset) => preset.id === presetId)

export const presetByBaseUrl = (baseUrl: string): KnownPreset | undefined =>
  knownPresets.find(
    (preset) =>
      preset.baseUrl !== "" && preset.baseUrl.replace(/\/+$/, "") === baseUrl.replace(/\/+$/, ""),
  )

export const toPresetDescriptor = (preset: KnownPreset): Preset => ({
  id: preset.id,
  name: preset.name,
  icon: preset.icon,
  baseUrl: preset.baseUrl,
  needsKey: preset.needsKey,
  defaultModels: [...preset.defaultModels],
})
