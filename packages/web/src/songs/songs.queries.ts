import { useQuery } from "@tanstack/react-query"
import { Song, SongStatus } from "contracts/http/songs"
import { queryKeys } from "@/queryKeys"
import { fetchSong, fetchSongVisualization, fetchSongs, fetchStatus } from "./songs.api"

const isActiveStatus = (status: SongStatus | undefined) =>
  status === "queued" || status === "running"

export const useSongsQuery = () =>
  useQuery({
    queryKey: queryKeys.songs(),
    queryFn: fetchSongs,
    refetchInterval: (query) =>
      query.state.data?.items.some((song) => isActiveStatus(song.status)) ? 2000 : false,
  })

export const useSongQuery = (songId: string | null) =>
  useQuery({
    queryKey: queryKeys.song(songId ?? "none"),
    queryFn: () => {
      if (songId === null) throw new Error("song id is required")
      return fetchSong(songId)
    },
    enabled: songId !== null,
    refetchInterval: (query) => (isActiveStatus(query.state.data?.status) ? 1000 : false),
  })

export const useStatusQuery = () =>
  useQuery({
    queryKey: queryKeys.status(),
    queryFn: fetchStatus,
    refetchInterval: 5000,
  })

/**
 * Polls while the visual is being authored. `pending` has no code yet;
 * `rerolling` still has the old code playing until the new checksum lands.
 * The measured analysis rides along and never changes.
 */
export const useVisualizationQuery = (songId: string | null) =>
  useQuery({
    queryKey: queryKeys.visualization(songId ?? "none"),
    queryFn: () => {
      if (songId === null) throw new Error("song id is required")
      return fetchSongVisualization(songId)
    },
    enabled: songId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.visualization?.status
      return status === "pending" || status === "rerolling" ? 1000 : false
    },
  })

export const pickActiveSong = (songs: readonly Song[], activeId: string | null): Song | null => {
  if (songs.length === 0) return null
  const match = songs.find((song) => song.id === activeId)
  if (match !== undefined) return match
  return songs[0] ?? null
}
