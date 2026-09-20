import * as React from "react"
import { LyricCue } from "./songs.lyrics.timing"
import { VisualizationEngine, VisualizationSong } from "./songs.visualization"

type VisualizationCanvasProps = Readonly<{
  engine: VisualizationEngine
  song: VisualizationSong
  code: string
  cues: readonly LyricCue[]
  /** A compile or render failure; the caller falls back to a trip mode. */
  onFailure: (detail: string) => void
}>

/** The full-screen backdrop while the active Song has a ready visualization. */
export const VisualizationCanvas: React.FC<VisualizationCanvasProps> = ({
  engine,
  song,
  code,
  cues,
  onFailure,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    if (!engine.attach({ canvas, song, code, cues, onError: onFailure })) return
    return () => {
      engine.detach()
    }
  }, [engine, song, code, cues, onFailure])

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 z-0 h-full w-full" />
}
