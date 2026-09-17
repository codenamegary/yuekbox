import * as React from "react"
import { Song } from "contracts/http/songs"
import { AudioEngine } from "./songs.audio.engine"
import { songAudioSource } from "./songs.api"

type SpectrumBarsProps = Readonly<{
  engine: AudioEngine
}>

const SpectrumBars: React.FC<SpectrumBarsProps> = ({ engine }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const bars: HTMLDivElement[] = []
    for (let index = 0; index < 32; index += 1) {
      const bar = document.createElement("div")
      bar.className =
        "w-0.5 bg-gradient-to-t from-cyan-400 to-white rounded-full transition-all duration-75"
      bar.style.height = "4px"
      container.appendChild(bar)
      bars.push(bar)
    }

    const frame = { handle: 0 }
    const tick = () => {
      for (let index = 0; index < bars.length; index += 1) {
        const bar = bars[index]
        if (bar === undefined) continue
        bar.style.height = `${Math.max(3, (engine.bins[index] ?? 0) * 22)}px`
      }
      frame.handle = requestAnimationFrame(tick)
    }
    frame.handle = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame.handle)
      container.replaceChildren()
    }
  }, [engine])

  return (
    <div
      ref={containerRef}
      className="flex-1 h-5 flex items-end justify-center gap-1.5 opacity-60"
    />
  )
}

type SongPlayerProps = Readonly<{
  song: Song | null
  engine: AudioEngine
  onPoke: () => void
}>

export const SongPlayer: React.FC<SongPlayerProps> = ({ song, engine, onPoke }) => {
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const scrubberRef = React.useRef<HTMLDivElement | null>(null)
  const [playing, setPlaying] = React.useState(false)

  React.useEffect(() => {
    const element = audioRef.current
    if (element === null) return
    engine.attach(element)
    return engine.subscribe(() => setPlaying(engine.isPlaying()))
  }, [engine])

  React.useEffect(() => {
    const frame = { handle: 0 }
    const tick = () => {
      const scrubber = scrubberRef.current
      if (scrubber !== null) {
        const total = engine.duration()
        const ratio = total > 0 ? engine.currentTime() / total : 0
        scrubber.style.width = `${(ratio * 100).toFixed(2)}%`
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

  const scrub = (event: React.MouseEvent<HTMLElement>) => {
    if (!complete) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / Math.max(1, rect.width)
    const total = engine.duration()
    if (total > 0) engine.seek(ratio * total)
  }

  return (
    <div className="w-full max-w-2xl mx-auto pointer-events-auto">
      <div className="pure-transparent-player py-3 px-6 flex items-center justify-between gap-6">
        <button
          type="button"
          onClick={toggle}
          disabled={!complete}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-transform active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
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

        <SpectrumBars engine={engine} />

        <button
          type="button"
          aria-label="Seek"
          onClick={scrub}
          className="w-36 h-1 bg-white/10 hover:bg-white/20 rounded-full cursor-pointer relative overflow-hidden transition-all"
        >
          <div
            ref={scrubberRef}
            className="h-full w-0 bg-gradient-to-r from-cyan-400 via-sky-300 to-white rounded-full"
          />
        </button>

        <button
          type="button"
          onClick={onPoke}
          className="text-white/40 hover:text-cyan-300 transition-colors text-xs font-mono"
          title="Acoustic Pulse"
        >
          ⏛
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
