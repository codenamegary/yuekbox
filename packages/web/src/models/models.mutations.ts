import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ModelKey } from "contracts/http/models"
import { queryKeys } from "@/queryKeys"
import { saveModelPath, startModelDownload } from "./models.api"

export type StartDownloadInput = Readonly<{ key: ModelKey; confirm: boolean }>

export const useStartModelDownloadMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: StartDownloadInput) => startModelDownload(input.key, input.confirm),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.modelDownloads() })
    },
  })
}

export type SaveModelPathInput = Readonly<{ key: ModelKey; path: string }>

export const useSaveModelPathMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveModelPathInput) => saveModelPath(input.key, input.path),
    onSuccess: async () => {
      // The server resolves the saved path live, so both the rows and the
      // download snapshots change the moment the write lands.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.readiness() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.modelDownloads() }),
      ])
    },
  })
}
