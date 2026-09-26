import * as React from "react"
import { ModelKey } from "contracts/http/models"
import { errorMessage } from "@/lib/problems"
import { ModelRow } from "./ModelRow"
import { useDownloadWatch, useReadinessQuery } from "./models.queries"
import { hasActiveDownload, modelRowViews } from "./models.view"

export type ModelRowsProps = Readonly<{
  keys: readonly ModelKey[]
  /** Paths the server already said it will not download into, when it said so. */
  externalPaths?: Readonly<Record<ModelKey, string | null>>
}>

/** The model rows, shared by the panel and the blocked-generation prompt. */
export const ModelRows: React.FC<ModelRowsProps> = ({ keys, externalPaths }) => {
  const downloads = useDownloadWatch()
  const readiness = useReadinessQuery(hasActiveDownload(downloads.data))
  const rows = React.useMemo(
    () => modelRowViews(readiness.data, downloads.data),
    [readiness.data, downloads.data],
  )

  if (readiness.data === undefined) {
    return readiness.isError ? (
      <p className="py-3 font-mono text-2xs leading-relaxed text-rose-300/90">
        could not read the models · {errorMessage(readiness.error)}
      </p>
    ) : (
      <p className="animate-pulse py-3 font-mono text-2xs text-slate-400">checking the models…</p>
    )
  }

  return (
    <ul className="divide-y divide-white/5">
      {rows
        .filter((row) => keys.includes(row.key))
        .map((row) => (
          <ModelRow key={row.key} row={row} externalPath={externalPaths?.[row.key] ?? null} />
        ))}
    </ul>
  )
}
