import * as React from "react"
import { Download, Trash2 } from "lucide-react"
import { PanelHeader } from "@/components/ui/PanelHeader"
import { Song } from "contracts/http/songs"
import { Status } from "contracts/http/status"
import { cn } from "@/lib/cn"
import { mp3FileName, songDownloadHref } from "./songs.download"
import { formatDuration, statusLabels } from "./songs.stages"

type SongListProps = Readonly<{
  open: boolean
  songs: readonly Song[]
  activeId: string | null
  status: Status | undefined
  onSelect: (songId: string) => void
  onDelete: (songId: string) => void
  onClose: () => void
}>

const bandLabelColor = (song: Song): string => {
  if (song.status === "failed") return "text-danger"
  if (song.status === "complete") return "text-paper-ink/70"
  return "text-orange-deep"
}

const bandLabel = (song: Song): string =>
  song.status === "complete" && song.durationSeconds !== undefined
    ? formatDuration(song.durationSeconds)
    : statusLabels[song.status]

export const SongList: React.FC<SongListProps> = ({
  open,
  songs,
  activeId,
  status,
  onSelect,
  onDelete,
  onClose,
}) => {
  const [confirmId, setConfirmId] = React.useState<string | null>(null)

  const dependencyLabel = (value: "ok" | "missing" | undefined) =>
    value === undefined ? "…" : value

  return (
    <aside
      id="history-drawer"
      aria-label="Song history"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-line bg-panel transition-transform duration-500 sm:w-[28rem]",
        "shadow-drawer",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <PanelHeader title="History" closeLabel="Close song history" onClose={onClose} />

      <ol className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
        {songs.length === 0 ? (
          <li className="text-base text-dim">No songs yet. Generate one and it lands here.</li>
        ) : null}
        {songs.map((song) => {
          const current = song.id === activeId
          const confirming = confirmId === song.id
          return (
            <li key={song.id} className="group flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => onSelect(song.id)}
                aria-current={current ? "true" : undefined}
                className={cn("strip px-4 py-2.5 text-left", current && "strip-current")}
              >
                <span className="block truncate text-center font-mono text-base font-bold uppercase">
                  {song.title}
                </span>
                <span className="my-1 flex items-center gap-2" aria-hidden>
                  <span className="strip-band" />
                  <span
                    className={cn("font-mono text-sm font-bold tabular-nums", bandLabelColor(song))}
                  >
                    {bandLabel(song)}
                  </span>
                  <span className="strip-band" />
                </span>
                <span className="sr-only">{bandLabel(song)}. Style: </span>
                <span className="block truncate text-center font-mono text-sm text-paper-ink/75">
                  {song.style}
                </span>
              </button>

              <div className="flex w-10 shrink-0 flex-col justify-center gap-1.5">
                {confirming ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(song.id)
                        setConfirmId(null)
                      }}
                      className="rounded-md bg-danger px-1 py-1 text-sm font-semibold text-snow hover:bg-danger"
                    >
                      Toss
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-md px-1 py-1 text-sm font-medium text-dim hover:text-snow"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    {song.status === "complete" ? (
                      <a
                        href={songDownloadHref(song.id)}
                        download={mp3FileName(song.id)}
                        className="key size-10"
                        title="Download MP3"
                        aria-label={`Download MP3 for ${song.title}`}
                      >
                        <Download className="size-5" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setConfirmId(song.id)}
                      className="key size-10 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-alarm"
                      title="Delete song"
                      aria-label={`Delete ${song.title}`}
                    >
                      <Trash2 className="size-5" />
                    </button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <footer className="border-t border-line px-6 py-4 text-sm text-dim">
        ffmpeg {dependencyLabel(status?.ffmpeg)} · yue2 {dependencyLabel(status?.yue2)} · sheetsage2{" "}
        {dependencyLabel(status?.sheetsage2)} · queue {status?.queueDepth ?? 0}
      </footer>
    </aside>
  )
}
