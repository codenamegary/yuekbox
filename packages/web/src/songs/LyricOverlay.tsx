import * as React from "react"
import { cn } from "@/lib/cn"
import { AudioEngine } from "./songs.audio.engine"
import { LyricCue, cueIndexAt, lyricEnvelope, lyricFadeInSeconds } from "./songs.lyrics.timing"
import { prefersReducedMotion } from "./songs.motion"

type LyricOverlayProps = Readonly<{
  cues: readonly LyricCue[]
  engine: AudioEngine
  /** The visualization owns the lyrics while it runs. */
  muted: boolean
}>

const fontClassFor = (text: string): string => {
  if (text.length > 48) return "text-3xl sm:text-4xl md:text-5xl lg:text-6xl"
  if (text.length > 28) return "text-4xl sm:text-5xl md:text-6xl lg:text-7xl"
  return "text-5xl sm:text-6xl md:text-7xl lg:text-8xl"
}

const lyricMotion = (progress: number, fadeInFraction: number) => {
  const opacity = lyricEnvelope(progress, fadeInFraction)
  const appear = Math.min(1, Math.max(0, progress / fadeInFraction))
  return {
    opacity: opacity.toFixed(3),
    transform: `translateY(${((1 - appear) * 24).toFixed(1)}px) scale(${(0.97 + appear * 0.03).toFixed(3)})`,
    filter: `blur(${((1 - appear) * 10).toFixed(1)}px)`,
  }
}

export const LyricOverlay: React.FC<LyricOverlayProps> = ({ cues, engine, muted }) => {
  const [playing, setPlaying] = React.useState(false)
  const [cueIndex, setCueIndex] = React.useState<number | null>(null)
  const textRef = React.useRef<HTMLParagraphElement | null>(null)

  React.useEffect(() => {
    return engine.subscribe(() => setPlaying(engine.isPlaying()))
  }, [engine])

  React.useEffect(() => {
    const frame = { handle: 0 }
    let lastIndex: number | null = null

    const tick = () => {
      const time = engine.currentTime()
      const index = cueIndexAt(cues, time)
      if (index !== lastIndex) {
        lastIndex = index
        setCueIndex(index)
      }
      const element = textRef.current
      if (element !== null && index !== null) {
        const cue = cues[index]
        if (cue !== undefined) {
          const span = Math.max(0.001, cue.endSeconds - cue.startSeconds)
          const fadeInFraction = Math.min(1, lyricFadeInSeconds / span)
          const motion = lyricMotion((time - cue.startSeconds) / span, fadeInFraction)
          element.style.opacity = motion.opacity
          if (!prefersReducedMotion()) {
            element.style.transform = motion.transform
            element.style.filter = motion.filter
          }
        }
      }
      frame.handle = requestAnimationFrame(tick)
    }

    frame.handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.handle)
  }, [cues, engine])

  const activeCue = cueIndex === null ? null : (cues[cueIndex] ?? null)
  const visible = playing && !muted && activeCue !== null

  return (
    <div
      aria-hidden="true"
      className={cn(
        "fixed inset-0 z-[15] flex items-center justify-center px-6 pointer-events-none select-none transition-opacity duration-700",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      {activeCue === null ? null : (
        <p
          key={activeCue.startSeconds}
          ref={textRef}
          style={{ opacity: 0 }}
          className={cn(
            "lyric-line max-w-5xl text-center font-black text-white leading-[1.06] tracking-[-0.02em] text-balance",
            fontClassFor(activeCue.text),
          )}
        >
          {activeCue.text}
        </p>
      )}
    </div>
  )
}
