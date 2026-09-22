import * as React from "react"
import { SongAnalysis } from "contracts/http/visualizations"
import { TripMode, WinampEngine } from "./songs.winamp.engine"

type WinampCanvasProps = Readonly<{
  engine: WinampEngine
  mode: TripMode
  /** The active Song's measured score; its downbeats drive the surge. */
  analysis: SongAnalysis | null
}>

export const WinampCanvas: React.FC<WinampCanvasProps> = ({ engine, mode, analysis }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    engine.attach(canvas)
    engine.start()
    return () => engine.stop()
  }, [engine])

  React.useEffect(() => {
    engine.setAnalysis(analysis)
  }, [engine, analysis])

  React.useEffect(() => {
    engine.setMode(mode)
  }, [engine, mode])

  return <canvas ref={canvasRef} className="fixed inset-0 z-0" />
}
