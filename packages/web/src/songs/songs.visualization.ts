import { SongAnalysis } from "contracts/http/visualizations"
import { LyricCue } from "./songs.lyrics.timing"

/** Sizes are CSS pixels. `dpr` is the ratio the host pre-scales the context for. */
export type VisualizationSize = Readonly<{ width: number; height: number; dpr: number }>

export type VisualizationSong = Readonly<{
  id: string
  style: string
  lyrics: string
  seed: number
}>

export type AudioFrame = Readonly<{
  time: number
  duration: number
  playing: boolean
  bins: Float32Array
  width: number
  height: number
  dpr: number
}>

/**
 * Everything the visual gets at construction: the Song's identity, its timed
 * lyric lines, and the measured score of the rendered audio. The lyric lines
 * and the analysis are the whole timeline, so the visual works out the active
 * line and the current beat from `frame.time` itself.
 */
export type VisualizationHost = Readonly<{
  canvas: HTMLCanvasElement
  song: VisualizationSong
  cues: readonly LyricCue[]
  analysis: SongAnalysis | null
}>

export type VisualizationInstance = Readonly<{
  resize: (size: VisualizationSize) => void
  renderAudioFrame: (frame: AudioFrame) => void
  dispose: () => void
}>

export type VisualizationFactory = (host: VisualizationHost) => VisualizationInstance

/**
 * The model returns one function expression. Compile it into a factory, or
 * null when the code does not even parse to one. This is the eval boundary.
 */
export const compileVisualization = (code: string): VisualizationFactory | null => {
  try {
    const candidate: unknown = new Function(`return (${code})`)()
    return typeof candidate === "function" ? (candidate as VisualizationFactory) : null
  } catch {
    return null
  }
}

const hasVisualizationMethods = (value: unknown): value is VisualizationInstance => {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.resize === "function" &&
    typeof candidate.renderAudioFrame === "function" &&
    typeof candidate.dispose === "function"
  )
}

export type VisualizationSource = Readonly<{
  time: () => number
  duration: () => number
  isPlaying: () => boolean
  bins: () => Float32Array
}>

export type VisualizationMount = Readonly<{
  canvas: HTMLCanvasElement
  song: VisualizationSong
  code: string
  cues: readonly LyricCue[]
  analysis: SongAnalysis | null
  /** A throw stops the loop and comes back here; the caller falls back to a trip mode. */
  onError: (detail: string) => void
}>

export type VisualizationEngine = Readonly<{
  attach: (mount: VisualizationMount) => boolean
  detach: () => void
}>

/**
 * Drives one model-authored factory: resize on mount and window resize,
 * renderAudioFrame per rAF. The factory holds the cues and the measured score,
 * so there is no per-line callback. A throw detaches and hands the detail back
 * through the mount's `onError`, so the caller can fall back to a trip mode.
 */
export const createVisualizationEngine = (source: VisualizationSource): VisualizationEngine => {
  const state: {
    canvas: HTMLCanvasElement | null
    context: CanvasRenderingContext2D | null
    instance: VisualizationInstance | null
    width: number
    height: number
    dpr: number
    handle: number
    onError: ((detail: string) => void) | null
  } = {
    canvas: null,
    context: null,
    instance: null,
    width: 0,
    height: 0,
    dpr: 1,
    handle: 0,
    onError: null,
  }

  const resize = () => {
    const canvas = state.canvas
    const instance = state.instance
    if (canvas === null || instance === null) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    state.width = width
    state.height = height
    state.dpr = dpr
    instance.resize({ width, height, dpr })
  }

  const detach = () => {
    cancelAnimationFrame(state.handle)
    state.handle = 0
    window.removeEventListener("resize", resize)
    state.instance?.dispose()
    state.instance = null
  }

  const fail = (error: unknown) => {
    detach()
    state.onError?.(error instanceof Error ? error.message : String(error))
  }

  const tick = () => {
    const instance = state.instance
    const context = state.context
    if (instance === null || context === null) return
    try {
      context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0)
      instance.renderAudioFrame({
        time: source.time(),
        duration: source.duration(),
        playing: source.isPlaying(),
        bins: source.bins(),
        width: state.width,
        height: state.height,
        dpr: state.dpr,
      })
    } catch (error) {
      fail(error)
      return
    }
    state.handle = requestAnimationFrame(tick)
  }

  const attach = (mount: VisualizationMount): boolean => {
    detach()
    state.onError = mount.onError
    const factory = compileVisualization(mount.code)
    if (factory === null) {
      fail(new Error("the visualization code did not compile to a function"))
      return false
    }
    const context = mount.canvas.getContext("2d")
    if (context === null) {
      fail(new Error("the canvas has no 2d context"))
      return false
    }
    try {
      const instance = factory({
        canvas: mount.canvas,
        song: mount.song,
        cues: mount.cues,
        analysis: mount.analysis,
      })
      if (!hasVisualizationMethods(instance)) {
        fail(new Error("the visualization instance is missing required methods"))
        return false
      }
      state.canvas = mount.canvas
      state.context = context
      state.instance = instance
      resize()
      window.addEventListener("resize", resize)
      state.handle = requestAnimationFrame(tick)
      return true
    } catch (error) {
      fail(error)
      return false
    }
  }

  return { attach, detach }
}
