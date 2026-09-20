import { useQuery } from "@tanstack/react-query"
import { EnhanceScope } from "contracts/http/ai"
import { queryKeys } from "@/queryKeys"
import { fetchAiConfig, fetchAiModels, fetchAiPresets } from "./ai.api"

export const useAiPresetsQuery = () =>
  useQuery({
    queryKey: queryKeys.aiPresets(),
    queryFn: fetchAiPresets,
    staleTime: Infinity,
  })

export const useAiConfigQuery = () =>
  useQuery({
    queryKey: queryKeys.aiConfig(),
    queryFn: fetchAiConfig,
  })

/**
 * Live model list for one writer, from its own endpoint. `version` bumps
 * whenever settings are saved so the list refetches with fresh credentials.
 */
export const useAiModelsQuery = (scope: EnhanceScope, enabled: boolean, version: number) =>
  useQuery({
    queryKey: [...queryKeys.aiModels(scope), version],
    queryFn: () => fetchAiModels(scope),
    enabled,
    staleTime: 30_000,
  })
