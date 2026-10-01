import * as React from "react"
import { X } from "lucide-react"
import { useEscapeKey } from "@/lib/use-escape-key"
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
  useEscapeKey(onClose)
  const readiness = useReadinessQuery()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="models"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div className="absolute inset-0 bg-cabinet-sunken/75 backdrop-blur-sm" onClick={onClose} />

      <div className="cabinet panel-rise relative max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-6 sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-5xl leading-none font-black tracking-tight text-amber uppercase">
              Models
            </h2>
            <p className="mt-2 text-base text-dim">
              The parts inside the box. Point at a copy you already have, or let Yuekbox download
              one.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="key shrink-0"
            aria-label="Close models"
            title="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="mt-4">
          <ModelRows keys={allKeys} />
        </div>

        <footer className="mt-4 border-t border-cabinet-line pt-4">
          <SystemLine system={readiness.data?.system} />
        </footer>
      </div>
    </div>
  )
}
