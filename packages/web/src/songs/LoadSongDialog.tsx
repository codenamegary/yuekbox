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
      <div className="absolute inset-0 bg-cabinet-sunken/75 backdrop-blur-sm" onClick={onCancel} />

      <div className="cabinet panel-rise relative w-full max-w-md rounded-2xl p-6">
        <h2 id="load-song-title" className="text-xl font-semibold text-ivory">
          Replace what you wrote?
        </h2>
        <p className="mt-2 text-base text-dim">
          Loading &ldquo;{song.title}&rdquo; puts its lyrics and style in the boxes. What&apos;s
          there now goes away.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} autoFocus>
            Keep mine
          </Button>
          <Button type="button" onClick={onConfirm}>
            Replace
          </Button>
        </div>
      </div>
    </div>
  )
}
