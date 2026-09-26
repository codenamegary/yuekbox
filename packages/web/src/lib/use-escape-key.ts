import * as React from "react"

/**
 * Runs the handler when Escape goes down, while `enabled` holds. Dialogs and
 * panels share it, so every surface closes on the same key the same way.
 */
export const useEscapeKey = (onEscape: (event: KeyboardEvent) => void, enabled = true): void => {
  React.useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onEscape(event)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled, onEscape])
}
