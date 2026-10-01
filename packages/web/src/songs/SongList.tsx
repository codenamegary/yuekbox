import * as React from "react"
import { Download, Trash2, X } from "lucide-react"
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
  if (song.status === "failed") return "text-cherry"
  if (song.status === "complete") return "text-strip-ink/70"
  return "text-[#9a5b0c]"
}

const bandLabel = (song: Song): string =>
  song.status === "complete" && song.durationSeconds !== undefined
    ? formatDuration(song.durationSeconds)
    : statusLabels[song.status]

const recordCount = (count: number): string => (count === 1 ? "1 record" : `${count} records`)

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
        "fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-cabinet-line bg-cabinet transition-transform duration-500 sm:w-[28rem]",
        "shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.8)]",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <header className="flex items-center justify-between gap-4 border-b border-cabinet-line px-6 py-5">
        <div>
          <h2 className="font-display text-4xl leading-none font-black tracking-tight text-amber uppercase">
            The stack
          </h2>
          <p className="mt-1 text-base text-dim">
            {songs.length === 0 ? "Empty. Go make something." : recordCount(songs.length)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="key"
          aria-label="Close song history"
          title="Close"
        >
          <X className="size-5" />
        </button>
      </header>

      <ol className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
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
                <span className="block truncate text-center font-mono text-sm text-strip-ink/75">
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
                      className="rounded-md bg-cherry px-1 py-1 text-sm font-semibold text-ivory hover:bg-cherry-bright"
                    >
                      Toss
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-md px-1 py-1 text-sm font-medium text-dim hover:text-ivory"
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

      <footer className="border-t border-cabinet-line px-6 py-4 text-sm text-dim">
        <p>Pressed locally with YuE2.</p>
        <p className="mt-0.5">
          ffmpeg {dependencyLabel(status?.ffmpeg)} · yue2 {dependencyLabel(status?.yue2)} ·
          sheetsage2 {dependencyLabel(status?.sheetsage2)} · queue {status?.queueDepth ?? 0}
        </p>
      </footer>
    </aside>
  )
}
