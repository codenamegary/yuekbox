import { WriterScope } from "contracts/http/ai"

export const queryKeys = {
  songs: () => ["songs"] as const,
  song: (songId: string) => ["song", songId] as const,
  visualization: (songId: string) => ["visualization", songId] as const,
  status: () => ["status"] as const,
  readiness: () => ["readiness"] as const,
  modelDownloads: () => ["models", "downloads"] as const,
  aiPresets: () => ["ai", "presets"] as const,
  aiConfig: () => ["ai", "config"] as const,
  aiModels: (scope: WriterScope) => ["ai", "models", scope] as const,
}
