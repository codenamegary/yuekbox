import { SongAnalysis } from "contracts/http/visualizations"

export type TripMode = 0 | 1 | 2 | 3

export type FrequencySource = Readonly<{
  bins: () => Float32Array
  isPlaying: () => boolean
  /** Playback seconds, used to land the surge on the measured downbeats. */
  time: () => number
}>

export type WinampEngine = Readonly<{
  attach: (canvas: HTMLCanvasElement) => void
  start: () => void
  stop: () => void
  setMode: (mode: TripMode) => void
  setAnalysis: (analysis: SongAnalysis | null) => void
  pulse: (amount: number) => void
}>

/** The measured downbeat times, earliest first, or an empty list. */
export const downbeatTimes = (analysis: SongAnalysis | null): readonly number[] => {
  if (analysis === null) return []
  return analysis.beats
    .filter((beat) => beat.position === 1)
    .map((beat) => beat.time)
    .toSorted((left, right) => left - right)
}

/** The latest downbeat at or before `time`, or null before the first one. */
export const downbeatAt = (downbeats: readonly number[], time: number): number | null => {
  let found: number | null = null // structure: allow-let
  for (const downbeat of downbeats) {
    if (downbeat > time) break
    found = downbeat
  }
  return found
}

const downbeatSurge = 1.1

export const createWinampEngine = (source: FrequencySource): WinampEngine => {
  const state: {
    canvas: HTMLCanvasElement | null
    context: CanvasRenderingContext2D | null
    width: number
    height: number
    frame: number
    handle: number
    mode: TripMode
    surge: number
    downbeats: readonly number[]
    lastDownbeat: number | null
    mouseX: number
    mouseY: number
    targetX: number
    targetY: number
  } = {
    canvas: null,
    context: null,
    width: 0,
    height: 0,
    frame: 0,
    handle: 0,
    mode: 0,
    surge: 0,
    downbeats: [],
    lastDownbeat: null,
    mouseX: 0.5,
    mouseY: 0.5,
    targetX: 0.5,
    targetY: 0.5,
  }

  /** A genuine crossing pulses; a seek backward just re-anchors. */
  const checkDownbeats = () => {
    if (state.downbeats.length === 0) return
    const downbeat = downbeatAt(state.downbeats, source.time())
    if (downbeat === null || downbeat === state.lastDownbeat) return
    if (state.lastDownbeat === null || downbeat > state.lastDownbeat) {
      state.surge = Math.min(1.8, state.surge + downbeatSurge)
    }
    state.lastDownbeat = downbeat
  }

  const resize = () => {
    const canvas = state.canvas
    if (canvas === null) return
    state.width = canvas.width = window.innerWidth
    state.height = canvas.height = window.innerHeight
  }

  const onMouseMove = (event: MouseEvent) => {
    state.targetX = event.clientX / Math.max(1, state.width)
    state.targetY = event.clientY / Math.max(1, state.height)
  }

  const drawTunnel = (target: CanvasRenderingContext2D, bins: Float32Array) => {
    const context = target
    const { width, height, frame, mouseX, mouseY, surge } = state
    context.fillStyle = "rgba(1, 2, 6, 0.16)"
    context.fillRect(0, 0, width, height)

    const centerX = width * (0.35 + (mouseX - 0.5) * 0.2)
    const centerY = height * (0.5 + (mouseY - 0.5) * 0.2)
    const bass = (bins[0] ?? 0) * 2.2

    context.save()
    context.translate(centerX, centerY)
    context.rotate(frame * 0.005)

    const rings = 14
    for (let ring = 0; ring < rings; ring += 1) {
      // structure: allow-let
      context.beginPath()
      const radius = ring * 30 + bass * 22
      const hue = (190 + ring * 12 + frame * 0.4) % 360
      context.strokeStyle = `hsla(${hue}, 90%, 65%, ${0.2 + surge * 0.28})`
      context.lineWidth = 1.2 + bass * 0.8

      const points = 6 + (ring % 4)
      for (let point = 0; point <= points; point += 1) {
        // structure: allow-let
        const angle = (point / points) * Math.PI * 2 + frame * 0.008 * (ring % 2 === 0 ? 1 : -1)
        const warp = Math.sin(angle * 3 + frame * 0.05) * (14 * (bins[ring % 32] ?? 0))
        const x = Math.cos(angle) * (radius + warp)
        const y = Math.sin(angle) * (radius + warp)
        if (point === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.stroke()
    }
    context.restore()
  }

  const drawOscilloscope = (target: CanvasRenderingContext2D, bins: Float32Array) => {
    const context = target
    const { width, height, frame, surge } = state
    context.fillStyle = "rgba(1, 2, 6, 0.18)"
    context.fillRect(0, 0, width, height)

    const centerY = height * 0.5

    for (let ribbon = 0; ribbon < 3; ribbon += 1) {
      // structure: allow-let
      context.beginPath()
      context.moveTo(0, centerY)

      for (let x = 0; x < width; x += 6) {
        // structure: allow-let
        const normalized = x / Math.max(1, width)
        const index = Math.floor(normalized * 31)
        const value = bins[index] ?? 0
        const amplitude = value * (160 + ribbon * 40 + surge * 120)
        const y =
          centerY +
          Math.sin(x * (0.01 + ribbon * 0.004) + frame * 0.07 + ribbon) * amplitude +
          Math.cos(x * 0.02 - frame * 0.04) * (amplitude * 0.4)
        context.lineTo(x, y)
      }

      if (ribbon === 0) {
        context.strokeStyle = "#00f0ff"
        context.lineWidth = 2.5
      } else if (ribbon === 1) {
        context.strokeStyle = "rgba(255, 255, 255, 0.5)"
        context.lineWidth = 1.5
      } else {
        context.strokeStyle = "rgba(37, 99, 235, 0.6)"
        context.lineWidth = 1.0
      }
      context.stroke()
    }
  }

  const drawPlasma = (target: CanvasRenderingContext2D, bins: Float32Array) => {
    const context = target
    const { width, height, frame, surge } = state
    context.fillStyle = "rgba(1, 2, 6, 0.18)"
    context.fillRect(0, 0, width, height)

    const bands = 16
    for (let band = 0; band < bands; band += 1) {
      // structure: allow-let
      const yPosition = (height / bands) * band
      context.beginPath()
      context.moveTo(0, yPosition)

      for (let x = 0; x < width; x += 18) {
        // structure: allow-let
        const value = bins[band % 32] ?? 0
        const offset =
          Math.sin(x * 0.007 + frame * 0.04 + band) * (45 * value + surge * 30) +
          Math.cos(x * 0.015 - frame * 0.025 + band * 0.6) * (30 * value)
        context.lineTo(x, yPosition + offset)
      }

      const hue = (180 + band * 11 + frame * 0.35) % 360
      context.strokeStyle = `hsla(${hue}, 88%, 65%, 0.35)`
      context.lineWidth = 2
      context.stroke()
    }
  }

  const drawVortex = (target: CanvasRenderingContext2D, bins: Float32Array) => {
    const context = target
    const { width, height, frame, surge } = state
    context.fillStyle = "rgba(1, 2, 6, 0.22)"
    context.fillRect(0, 0, width, height)

    const centerX = width * 0.5
    const centerY = height * 0.5
    const count = 90

    for (let index = 0; index < count; index += 1) {
      // structure: allow-let
      const speed = 0.015 + index * 0.0003
      const t = frame * speed + index * ((Math.PI * 2) / count)
      const value = bins[index % 32] ?? 0
      const distance = 60 + index * 6.5 + Math.sin(t * 3) * (40 * value + surge * 60)

      const x = centerX + Math.cos(t) * distance * 1.3
      const y = centerY + Math.sin(t) * distance * 0.8

      context.fillStyle =
        index % 3 === 0 ? "#00f0ff" : index % 3 === 1 ? "#ffffff" : "rgba(37, 99, 235, 0.9)"
      context.beginPath()
      context.arc(x, y, 1.8 + surge * 1.5, 0, Math.PI * 2)
      context.fill()
    }
  }

  const render = () => {
    const context = state.context
    if (context === null) return
    state.frame += 1
    if (state.surge > 0.01) state.surge *= 0.94

    state.mouseX += (state.targetX - state.mouseX) * 0.05
    state.mouseY += (state.targetY - state.mouseY) * 0.05

    if (source.isPlaying()) checkDownbeats()

    const bins = source.bins()
    if (state.mode === 0) drawTunnel(context, bins)
    else if (state.mode === 1) drawOscilloscope(context, bins)
    else if (state.mode === 2) drawPlasma(context, bins)
    else drawVortex(context, bins)

    state.handle = requestAnimationFrame(render)
  }

  const attach = (canvas: HTMLCanvasElement) => {
    state.canvas = canvas
    state.context = canvas.getContext("2d")
    resize()
    window.addEventListener("resize", resize)
    window.addEventListener("mousemove", onMouseMove)
  }

  const start = () => {
    cancelAnimationFrame(state.handle)
    state.handle = requestAnimationFrame(render)
  }

  const stop = () => {
    cancelAnimationFrame(state.handle)
    state.handle = 0
  }

  const setMode = (mode: TripMode) => {
    state.mode = mode
    const context = state.context
    if (context !== null) {
      context.fillStyle = "#010206"
      context.fillRect(0, 0, state.width, state.height)
    }
  }

  const pulse = (amount: number) => {
    state.surge = Math.min(1.8, state.surge + amount)
  }

  const setAnalysis = (analysis: SongAnalysis | null) => {
    state.downbeats = downbeatTimes(analysis)
    state.lastDownbeat = null
  }

  return { attach, start, stop, setMode, setAnalysis, pulse }
}
