import * as React from "react"
import { PanelHeader } from "@/components/ui/PanelHeader"
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
      <div className="absolute inset-0 bg-ink/75 backdrop-blur-sm" onClick={onClose} />

      <div className="panel panel-rise relative max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl">
        <PanelHeader title="Models" closeLabel="Close models" onClose={onClose} />

        <div className="px-6 sm:px-8">
          <ModelRows keys={allKeys} />
        </div>

        <footer className="mx-6 border-t border-line py-4 sm:mx-8">
          <SystemLine system={readiness.data?.system} />
        </footer>
      </div>
    </div>
  )
}
