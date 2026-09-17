export const queryKeys = {
  songs: () => ["songs"] as const,
  song: (songId: string) => ["song", songId] as const,
  status: () => ["status"] as const,
}
