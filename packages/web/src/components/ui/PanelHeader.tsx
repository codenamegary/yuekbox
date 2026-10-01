import * as React from "react"
import { X } from "lucide-react"

type PanelHeaderProps = Readonly<{
  title: string
  closeLabel: string
  onClose: () => void
  children?: React.ReactNode
}>

/** The tweed band across the top of a panel: title, optional controls, close. */
export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  closeLabel,
  onClose,
  children,
}) => (
  <header className="tweed flex items-center justify-between gap-4 px-6 py-4 sm:px-8">
    <h2 className="text-stage font-display text-2xl font-black tracking-tight text-snow font-stretch-expanded">
      {title}
    </h2>
    <div className="flex items-center gap-3">
      {children}
      <button
        type="button"
        onClick={onClose}
        className="key shrink-0"
        aria-label={closeLabel}
        title="Close"
      >
        <X className="size-5" />
      </button>
    </div>
  </header>
)
