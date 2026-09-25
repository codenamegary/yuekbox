import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { queryKeys } from "@/queryKeys"
import { fetchModelDownloads, fetchReadiness } from "./models.api"
import { activeDownloadKeys, downloadPollMs, hasActiveDownload } from "./models.view"

export const readinessPollMs = 2000

/**
 * Readiness is cheap to poll. While a model is arriving the rows poll it too,
 * so a finished download flips to ready without waiting for the next mount.
 */
export const useReadinessQuery = (poll = false) =>
  useQuery({
    queryKey: queryKeys.readiness(),
    queryFn: fetchReadiness,
    refetchInterval: poll ? readinessPollMs : false,
  })

/** Polls while a model is arriving, then stops. */
export const useModelDownloadsQuery = () =>
  useQuery({
    queryKey: queryKeys.modelDownloads(),
    queryFn: fetchModelDownloads,
    refetchInterval: (query) => (hasActiveDownload(query.state.data) ? downloadPollMs : false),
  })

/**
 * The downloads poll, plus a readiness refetch whenever the set of models in
 * flight changes. That covers one download finishing while another still runs,
 * and the last one settling.
 */
export const useDownloadWatch = () => {
  const queryClient = useQueryClient()
  const downloads = useModelDownloadsQuery()
  const activeKeys = activeDownloadKeys(downloads.data).join(",")
  const previous = React.useRef(activeKeys)

  React.useEffect(() => {
    if (previous.current === activeKeys) return
    previous.current = activeKeys
    void queryClient.invalidateQueries({ queryKey: queryKeys.readiness() })
  }, [activeKeys, queryClient])

  return downloads
}
