import * as React from "react"
import { useEscapeKey } from "@/lib/use-escape-key"
import { Song } from "contracts/http/songs"
import { Button } from "@/components/ui/Button"

type LoadSongDialogProps = Readonly<{
  song: Song | null
  onCancel: () => void
  onConfirm: () => void
}>

export const LoadSongDialog: React.FC<LoadSongDialogProps> = ({ song, onCancel, onConfirm }) => {
  useEscapeKey(onCancel, song !== null)

  if (song === null) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-song-title"
      className="fixed inset-0 z-40 flex items-center justify-center p-6"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div className="hairline-glass-box relative w-full max-w-sm rounded-2xl p-6">
        <p id="load-song-title" className="text-sm text-slate-100">
          Replace the style and lyrics in the editor?
        </p>
        <p className="mt-2 text-xs text-slate-400">
          This song&apos;s request will overwrite what is currently in the boxes.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            autoFocus
            className="text-slate-300 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            className="border border-cyan-400/50 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
          >
            Replace
          </Button>
        </div>
      </div>
    </div>
  )
}
