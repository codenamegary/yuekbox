import * as React from "react"
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

const statusColor = (song: Song): string => {
  if (song.status === "complete") return "text-cyan-300"
  if (song.status === "failed") return "text-rose-300"
  if (song.status === "running") return "text-amber-300"
  return "text-slate-400"
}

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
    <div
      id="history-drawer"
      className={cn(
        "fixed inset-y-0 right-0 w-80 bg-[#02050b]/90 backdrop-blur-2xl border-l border-white/10 z-30 p-6 flex flex-col justify-between transition-transform duration-500",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="text-xs font-mono font-bold tracking-widest text-slate-200 uppercase">
            History
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs font-mono"
          >
            ✕ Close
          </button>
        </div>

        <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
          {songs.length === 0 ? (
            <p className="text-xs font-mono text-slate-500 pt-2">No songs yet</p>
          ) : null}

          {songs.map((song) => (
            <div
              key={song.id}
              onClick={() => onSelect(song.id)}
              className={cn(
                "group p-3 rounded-xl border transition-all cursor-pointer",
                song.id === activeId
                  ? "bg-cyan-500/10 border-cyan-500/30"
                  : "bg-white/5 border-white/5 hover:bg-cyan-500/10 hover:border-cyan-500/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-medium text-white truncate">{song.style}</div>

                <div className="flex items-center gap-2 shrink-0">
                  {song.status === "complete" ? (
                    <a
                      href={songDownloadHref(song.id)}
                      download={mp3FileName(song.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="text-3xs font-mono text-slate-500 hover:text-cyan-300 transition-colors"
                      title="Download MP3"
                      aria-label={`Download MP3 for ${song.id}`}
                    >
                      ↓
                    </a>
                  ) : null}

                  {confirmId === song.id ? (
                    <>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onDelete(song.id)
                          setConfirmId(null)
                        }}
                        className="text-3xs font-mono text-rose-300 hover:text-rose-200"
                      >
                        delete
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setConfirmId(null)
                        }}
                        className="text-3xs font-mono text-slate-400 hover:text-white"
                      >
                        keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setConfirmId(song.id)
                      }}
                      className="text-3xs font-mono text-slate-500 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete song"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center text-3xs font-mono text-slate-400 mt-1">
                <span className="truncate">{song.id}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {song.reference !== undefined ? (
                    <span
                      className="text-cyan-300/70"
                      title={`Cover of ${song.reference.filename}`}
                    >
                      ⌁
                    </span>
                  ) : null}
                  <span className={statusColor(song)}>
                    {song.status === "complete" && song.durationSeconds !== undefined
                      ? formatDuration(song.durationSeconds)
                      : statusLabels[song.status]}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 pt-3 text-3xs font-mono text-slate-500 text-center">
        SQLite WAL // Local YuE2
        <br />
        ffmpeg {dependencyLabel(status?.ffmpeg)} · yue2 {dependencyLabel(status?.yue2)} · sheetsage2{" "}
        {dependencyLabel(status?.sheetsage2)} · queue {status?.queueDepth ?? 0}
      </div>
    </div>
  )
}
