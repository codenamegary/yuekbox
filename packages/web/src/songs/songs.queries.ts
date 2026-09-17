import { useQuery } from "@tanstack/react-query"
import { Song, SongStatus } from "contracts/http/songs"
import { queryKeys } from "@/queryKeys"
import { fetchSong, fetchSongs, fetchStatus } from "./songs.api"

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

export const pickActiveSong = (songs: readonly Song[], activeId: string | null): Song | null => {
  if (songs.length === 0) return null
  const match = songs.find((song) => song.id === activeId)
  if (match !== undefined) return match
  return songs[0] ?? null
}
