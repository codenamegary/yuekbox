import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CreateSongBody } from "contracts/http/songs"
import { queryKeys } from "@/queryKeys"
import { createSong, deleteSong, uploadReference } from "./songs.api"

export const useCreateSongMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSongBody) => createSong(body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.songs() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.status() }),
      ])
    },
  })
}

export const useUploadReferenceMutation = () =>
  useMutation({
    mutationFn: (file: File) => uploadReference(file),
  })

export const useDeleteSongMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (songId: string) => deleteSong(songId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.songs() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.status() }),
      ])
    },
  })
}
