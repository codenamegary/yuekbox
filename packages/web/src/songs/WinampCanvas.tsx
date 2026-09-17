import * as React from "react"
import { TripMode, WinampEngine } from "./songs.winamp.engine"

type WinampCanvasProps = Readonly<{
  engine: WinampEngine
  mode: TripMode
}>

export const WinampCanvas: React.FC<WinampCanvasProps> = ({ engine, mode }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    engine.attach(canvas)
    engine.start()
    return () => engine.stop()
  }, [engine])

  React.useEffect(() => {
    engine.setMode(mode)
  }, [engine, mode])

  return <canvas ref={canvasRef} className="fixed inset-0 z-0" />
}
