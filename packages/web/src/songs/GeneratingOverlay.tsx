import * as React from "react"
import { useEscapeKey } from "@/lib/use-escape-key"
import { Song, SongStatus } from "contracts/http/songs"
import { cn } from "@/lib/cn"
import { prefersReducedMotion } from "./songs.motion"
import { reelRowsFor, stageProgressPercent } from "./songs.stages"

type GeneratingOverlayProps = Readonly<{
  song: Song | null
  visible: boolean
  queueDepth: number | null
  onDismiss: () => void
}>

/** The reel at one instant: the words, the centered row, and how that row looked. */
type ReelSnapshot = Readonly<{
  labels: readonly string[]
  activeIndex: number
  status: SongStatus | null
  percent: number | null
}>

const rowHeightPx = 88
const visibleRows = 5
const noLabels: readonly string[] = []

const translateYFor = (activeIndex: number): number =>
  (Math.floor(visibleRows / 2) - activeIndex) * rowHeightPx

/** Fit the widest stage label ("Transcribing reference") inside a row at every width. */
const wordClassFor = (label: string): string => {
  const base = "font-black tracking-[-0.02em] whitespace-nowrap"
  if (label.length > 18) return cn(base, "text-xl sm:text-2xl md:text-3xl lg:text-4xl")
  if (label.length > 12) return cn(base, "text-2xl sm:text-3xl md:text-4xl lg:text-5xl")
  return cn(base, "text-3xl sm:text-4xl md:text-5xl lg:text-6xl")
}

export const GeneratingOverlay: React.FC<GeneratingOverlayProps> = ({
  song,
  visible,
  queueDepth,
  onDismiss,
}) => {
  const reducedMotion = prefersReducedMotion()

  useEscapeKey(onDismiss, visible)

  const reel = React.useMemo(() => (song === null ? null : reelRowsFor(song)), [song])
  const status = song?.status ?? null
  const percent =
    song !== null && song.status === "running" ? stageProgressPercent(song.stageProgress) : null
  const labels = reel === null ? noLabels : reel.labels
  const activeIndex = reel === null ? 0 : reel.activeIndex
  const activeLabel = reel === null ? "" : (reel.labels[activeIndex] ?? "")

  // Keep the rows as they looked before this stage change for the reduced-motion crossfade.
  const currentSnapshot: ReelSnapshot = { labels, activeIndex, status, percent }
  const [previous, setPrevious] = React.useState<ReelSnapshot>(currentSnapshot)
  const [fadeFrom, setFadeFrom] = React.useState<ReelSnapshot | null>(null)

  const snapshotChanged =
    previous.activeIndex !== activeIndex ||
    previous.status !== status ||
    previous.percent !== percent ||
    previous.labels.length !== labels.length ||
    previous.labels.some((label, index) => label !== labels[index])

  if (snapshotChanged) {
    if (previous.activeIndex !== activeIndex || previous.status !== status) {
      setFadeFrom(reducedMotion && visible ? previous : null)
    }
    setPrevious(currentSnapshot)
  }

  const announcementParts: string[] = [activeLabel]
  if (status === "queued" && queueDepth !== null && queueDepth > 0) {
    announcementParts.push(`queue ${queueDepth}`)
  }
  if (percent !== null) announcementParts.push(`${Math.round(percent)} percent`)

  const rowsFor = (
    rowLabels: readonly string[],
    center: number,
    rowStatus: SongStatus | null,
    barPercent: number | null,
  ) =>
    rowLabels.map((label, index) => {
      const active = index === center
      const state = !active
        ? index < center
          ? "text-cyan-300/40"
          : "text-white/15"
        : rowStatus === "failed"
          ? "reel-word-failed"
          : rowStatus === "complete"
            ? "reel-word-ready"
            : "reel-word-active"
      return (
        <div
          key={label}
          className={cn(
            "flex shrink-0 flex-col items-center justify-center gap-1.5",
            "transition-colors duration-500",
            wordClassFor(label),
            state,
          )}
          style={{ height: rowHeightPx }}
        >
          <span>{label}</span>
          {active && rowStatus === "running" && barPercent !== null ? (
            <div className="h-0.5 w-40 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-cyan-400/90 transition-[width] duration-700 ease-out"
                style={{ width: `${barPercent}%` }}
              />
            </div>
          ) : null}
          {active && rowStatus === "queued" && queueDepth !== null && queueDepth > 0 ? (
            <span className="font-mono text-3xs tracking-[0.3em] uppercase text-cyan-200/70">
              queue {queueDepth}
            </span>
          ) : null}
          {active && rowStatus === "failed" ? (
            <span
              className="max-w-[70vw] truncate font-mono text-3xs tracking-widest text-rose-300/80"
              title={song?.errorDetail}
            >
              {song?.errorDetail}
            </span>
          ) : null}
        </div>
      )
    })

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "fixed inset-0 z-[15] flex flex-col items-center justify-center gap-8 px-6",
        "pointer-events-none select-none transition-[opacity,visibility] duration-700 ease-out",
        visible ? "opacity-100" : "invisible opacity-0",
      )}
    >
      <div aria-live="polite" className="sr-only">
        {announcementParts.join(", ")}
      </div>

      {song === null || reel === null ? null : (
        <div
          className="reel-mask relative overflow-hidden"
          style={{ height: rowHeightPx * visibleRows }}
        >
          <div
            className="reel-strip"
            style={{ transform: `translateY(${translateYFor(activeIndex)}px)` }}
          >
            {rowsFor(labels, activeIndex, status, percent)}
          </div>
          {fadeFrom !== null && fadeFrom.labels.length > 0 ? (
            <div
              key={`${fadeFrom.activeIndex}:${fadeFrom.status ?? "none"}`}
              aria-hidden="true"
              className="reel-fade-out absolute top-0 inset-x-0"
              style={{ transform: `translateY(${translateYFor(fadeFrom.activeIndex)}px)` }}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) setFadeFrom(null)
              }}
            >
              {rowsFor(fadeFrom.labels, fadeFrom.activeIndex, fadeFrom.status, fadeFrom.percent)}
            </div>
          ) : null}
        </div>
      )}

      <button
        type="button"
        onClick={onDismiss}
        className="pointer-events-auto font-mono text-3xs tracking-[0.25em] uppercase text-white/35 transition-colors hover:text-white"
        title="Hide the generating overlay (Esc)"
      >
        dismiss ✕
      </button>
    </div>
  )
}
