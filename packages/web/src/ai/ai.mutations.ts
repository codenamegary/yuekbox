import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AiConfigPatch, EnhanceScope } from "contracts/http/ai"
import { MissingModel } from "contracts/http/models"
import { Song } from "contracts/http/songs"
import { blockedModelsFromError } from "@/models/models.problems"
import { queryKeys } from "@/queryKeys"
import { createRandomSong, enhanceText, EnhanceRequest, saveAiConfig } from "./ai.api"

export const useSaveAiConfigMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: AiConfigPatch) => saveAiConfig(patch),
    onSuccess: async (config) => {
      queryClient.setQueryData(queryKeys.aiConfig(), config)
    },
  })
}

export const useEnhanceMutation = (onDone: (kind: EnhanceScope, text: string) => void) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: EnhanceRequest) => enhanceText(request),
    onSuccess: async (result, request) => {
      onDone(request.kind, result.text)
      await queryClient.invalidateQueries({ queryKey: queryKeys.aiConfig() })
    },
  })
}

export const useRandomSongMutation = (
  onCreated: (song: Song) => void,
  onBlocked: (models: readonly MissingModel[]) => void,
) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createRandomSong,
    onSuccess: async (song) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.songs() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.status() }),
      ])
      onCreated(song)
    },
    onError: (error) => {
      const missing = blockedModelsFromError(error)
      if (missing !== null) onBlocked(missing)
    },
  })
}
