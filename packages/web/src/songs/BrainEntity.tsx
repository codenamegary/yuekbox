import * as React from "react"
import { BrainEngine } from "./songs.brain.engine"

type BrainEntityProps = Readonly<{
  engine: BrainEngine
  onPoke: () => void
}>

export const BrainEntity: React.FC<BrainEntityProps> = ({ engine, onPoke }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (canvas === null || container === null) return
    engine.attach(canvas, container)
    engine.start()
    return () => engine.stop()
  }, [engine])

  return (
    <div
      ref={containerRef}
      id="brain-entity-container"
      onClick={onPoke}
      title="Cybernetic Mind. Translucent crystal core with 3D specular glints."
      className="fixed right-[-2vw] bottom-[-4vh] z-[2] h-[530px] w-[530px] cursor-grab active:cursor-grabbing"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
