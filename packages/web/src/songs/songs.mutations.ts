import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MissingModel } from "contracts/http/models"
import { CreateSongBody } from "contracts/http/songs"
import { queryKeys } from "@/queryKeys"
import { blockedModelsFromError } from "@/models/models.problems"
import { createSong, deleteSong, requestSongVisualization, uploadReference } from "./songs.api"

export const useCreateSongMutation = (onBlocked: (models: readonly MissingModel[]) => void) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSongBody) => createSong(body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.songs() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.status() }),
      ])
    },
    onError: (error) => {
      const missing = blockedModelsFromError(error)
      if (missing !== null) onBlocked(missing)
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

export const useRerollVisualizationMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (songId: string) => requestSongVisualization(songId),
    onSuccess: async (_result, songId) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.visualization(songId) })
    },
  })
}
