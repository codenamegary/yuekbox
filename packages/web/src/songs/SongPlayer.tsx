import * as React from "react"
import { Pause, Play } from "lucide-react"
import { Song } from "contracts/http/songs"
import { cn } from "@/lib/cn"
import { AudioEngine } from "./songs.audio.engine"
import { seekRatio } from "./songs.player"
import { songAudioSource } from "./songs.api"
import { formatDuration } from "./songs.stages"

type SongPlayerProps = Readonly<{
  song: Song | null
  engine: AudioEngine
}>

const seekNudgeSeconds = 5

export const SongPlayer: React.FC<SongPlayerProps> = ({ song, engine }) => {
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const barRef = React.useRef<HTMLButtonElement | null>(null)
  const fillRef = React.useRef<HTMLSpanElement | null>(null)
  const thumbRef = React.useRef<HTMLSpanElement | null>(null)
  const timeRef = React.useRef<HTMLSpanElement | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [scrubbing, setScrubbing] = React.useState(false)

  React.useEffect(() => {
    const element = audioRef.current
    if (element === null) return
    engine.attach(element)
    return engine.subscribe(() => setPlaying(engine.isPlaying()))
  }, [engine])

  React.useEffect(() => {
    const frame = { handle: 0 }
    const tick = () => {
      const total = engine.duration()
      const ratio = total > 0 ? engine.currentTime() / total : 0
      const percent = `${(ratio * 100).toFixed(2)}%`
      if (fillRef.current !== null) fillRef.current.style.width = percent
      if (thumbRef.current !== null) thumbRef.current.style.left = percent
      if (timeRef.current !== null) {
        const elapsed = formatDuration(engine.currentTime())
        const text = total > 0 ? `${elapsed} / ${formatDuration(total)}` : elapsed
        if (timeRef.current.textContent !== text) timeRef.current.textContent = text
      }
      frame.handle = requestAnimationFrame(tick)
    }
    frame.handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.handle)
  }, [engine])

  const complete = song !== null && song.status === "complete"

  const toggle = () => {
    if (!complete) return
    if (playing) {
      engine.pause()
      return
    }
    void engine.play().catch(() => {})
  }

  const seekToPointer = (clientX: number) => {
    const bar = barRef.current
    if (bar === null) return
    const rect = bar.getBoundingClientRect()
    const total = engine.duration()
    if (total > 0) engine.seek(seekRatio(clientX, rect.left, rect.width) * total)
  }

  const beginScrub = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!complete || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setScrubbing(true)
    seekToPointer(event.clientX)
  }

  const moveScrub = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!scrubbing) return
    seekToPointer(event.clientX)
  }

  const endScrub = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!scrubbing) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setScrubbing(false)
  }

  const nudge = (deltaSeconds: number) => {
    const total = engine.duration()
    if (total <= 0) return
    engine.seek(engine.currentTime() + deltaSeconds)
  }

  const title = song === null ? "Nothing on the turntable" : song.title

  return (
    <div className="cabinet fixed top-6 left-6 z-20 flex w-[min(24rem,calc(100vw-3rem))] items-center gap-4 rounded-2xl p-3 pr-5 pointer-events-auto">
      <button
        type="button"
        onClick={toggle}
        disabled={!complete}
        aria-label={playing ? "Pause" : "Play"}
        title={playing ? "Pause" : "Play"}
        className={cn(
          "inline-flex size-14 shrink-0 items-center justify-center rounded-full text-ivory transition-[transform,background] duration-150",
          "bg-[radial-gradient(circle_at_35%_30%,var(--color-cherry-bright),var(--color-cherry)_60%,#8f241d)]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_0_rgba(0,0,0,0.5)] active:translate-y-px",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
      >
        {playing ? (
          <Pause className="size-6" fill="currentColor" />
        ) : (
          <Play className="ml-0.5 size-6" fill="currentColor" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={cn(
              "truncate text-base font-semibold",
              song === null ? "text-dim" : "text-ivory",
            )}
            title={title}
          >
            {title}
          </p>
          <span ref={timeRef} className="shrink-0 font-mono text-sm text-dim tabular-nums">
            00:00
          </span>
        </div>

        <button
          ref={barRef}
          type="button"
          aria-label="Seek"
          onPointerDown={beginScrub}
          onPointerMove={moveScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault()
              nudge(-seekNudgeSeconds)
            }
            if (event.key === "ArrowRight") {
              event.preventDefault()
              nudge(seekNudgeSeconds)
            }
          }}
          className="group relative mt-2 flex h-5 w-full cursor-pointer touch-none select-none items-center"
        >
          <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-cabinet-sunken shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]">
            <span ref={fillRef} className="block h-full w-0 rounded-full bg-amber" />
          </span>
          <span
            ref={thumbRef}
            className={cn(
              "pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cabinet bg-amber-soft transition-opacity",
              scrubbing
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
        </button>
      </div>

      <audio
        ref={audioRef}
        src={complete && song !== null ? songAudioSource(song.id) : undefined}
        preload="metadata"
        className="hidden"
      />
    </div>
  )
}
