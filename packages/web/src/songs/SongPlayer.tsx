import * as React from "react"
import { Song } from "contracts/http/songs"
import { cn } from "@/lib/cn"
import { AudioEngine } from "./songs.audio.engine"
import { seekRatio } from "./songs.player"
import { songAudioSource } from "./songs.api"

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

  return (
    <div className="fixed top-8 left-8 z-20 flex items-center gap-4 pointer-events-auto">
      <button
        type="button"
        onClick={toggle}
        disabled={!complete}
        className={cn(
          "alien-sigil disabled:opacity-30 disabled:pointer-events-none",
          playing && "active",
        )}
        title="Play / Pause"
      >
        {playing ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        )}
      </button>

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
        className="group relative flex h-5 w-40 cursor-pointer touch-none select-none items-center"
      >
        <span className="relative h-1 w-full overflow-hidden rounded-full bg-white/10 transition-colors group-hover:bg-white/20">
          <span
            ref={fillRef}
            className="block h-full w-0 rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-white"
          />
        </span>
        <span
          ref={thumbRef}
          className={cn(
            "pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(0,240,255,0.9)] transition-opacity",
            scrubbing ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        />
      </button>

      <audio
        ref={audioRef}
        src={complete && song !== null ? songAudioSource(song.id) : undefined}
        preload="metadata"
        className="hidden"
      />
    </div>
  )
}
