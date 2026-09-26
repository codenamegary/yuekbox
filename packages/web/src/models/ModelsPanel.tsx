import * as React from "react"
import { useReadinessQuery } from "./models.queries"
import { modelCatalogOrder } from "./models.catalog"
import { ModelRows } from "./ModelRows"
import { SystemLine } from "./SystemLine"

const allKeys = modelCatalogOrder

export type ModelsPanelProps = Readonly<{
  onClose: () => void
}>

/**
 * Where the five model folders live. The only user-owned setting in yuekbox,
 * so it stays separate from AI settings: models matter before AI is ever on.
 */
export const ModelsPanel: React.FC<ModelsPanelProps> = ({ onClose }) => {
  const readiness = useReadinessQuery()

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="models"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="ai-settings-panel hairline-glass-box relative max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="font-mono text-xs font-bold tracking-widest text-slate-200 uppercase">
            models
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs text-slate-400 hover:text-white"
          >
            ✕ Close
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-white/45">
          Point at a copy you already have, or let yuekbox download one.
        </p>

        <div className="mt-2">
          <ModelRows keys={allKeys} />
        </div>

        <footer className="mt-2 border-t border-white/10 pt-3">
          <SystemLine system={readiness.data?.system} />
        </footer>
      </div>
    </div>
  )
}
