import * as React from "react"
import { useEscapeKey } from "@/lib/use-escape-key"
import { MissingModel, ModelKey, modelKeyOrder } from "contracts/http/models"
import { cn } from "@/lib/cn"
import { ActionButton } from "./ModelControls"
import { ModelRows } from "./ModelRows"
import { useReadinessQuery } from "./models.queries"
import { blockedDetail, blockedTitle, modelsReadyTitle } from "./models.view"

export type MissingModelDialogProps = Readonly<{
  models: readonly MissingModel[]
  onClose: () => void
}>

/**
 * The paths the server already refused, keyed by model. A row keeps the note
 * only while its resolved path is still the refused one, so a saved folder
 * clears it instead of hiding the download button forever.
 */
const externalPaths = (models: readonly MissingModel[]): Record<ModelKey, string | null> => {
  const paths = {} as Record<ModelKey, string | null>
  for (const key of modelKeyOrder) {
    const model = models.find((entry) => entry.key === key)
    paths[key] = model !== undefined && !model.downloadable ? model.path : null
  }
  return paths
}

/**
 * The blocked generation. The missing models come straight from the server's
 * problem; this only renders them with the same two choices the panel offers.
 */
export const MissingModelDialog: React.FC<MissingModelDialogProps> = ({ models, onClose }) => {
  useEscapeKey(onClose)
  const readiness = useReadinessQuery()

  const allReady = models.every((model) => readiness.data?.models[model.key].state === "ready")

  const keys = models.map((model) => model.key)
  const refused = externalPaths(models)
  const title = allReady ? modelsReadyTitle(models) : blockedTitle(models)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[65] flex items-center justify-center p-4 sm:p-6"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="ai-settings-panel hairline-glass-box relative max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6">
        <p
          className={cn(
            "font-mono text-3xs uppercase tracking-[0.4em]",
            allReady ? "text-cyan-300/70" : "text-amber-200/70",
          )}
        >
          {allReady ? "ready to generate" : "generation blocked"}
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-50">
          {title}
        </h2>
        {allReady ? null : (
          <p className="mt-2 text-sm leading-relaxed text-white/60">{blockedDetail(models)}</p>
        )}

        <div className="mt-3 border-t border-white/10">
          <ModelRows keys={keys} externalPaths={refused} />
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          {allReady ? (
            <ActionButton tone="primary" onClick={onClose}>
              continue
            </ActionButton>
          ) : null}
          <ActionButton tone="ghost" onClick={onClose}>
            not now
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
