export const queryKeys = {
  songs: () => ["songs"] as const,
  song: (songId: string) => ["song", songId] as const,
  status: () => ["status"] as const,
  aiPresets: () => ["ai", "presets"] as const,
  aiConfig: () => ["ai", "config"] as const,
  aiModels: (scope: "style" | "lyrics") => ["ai", "models", scope] as const,
}
