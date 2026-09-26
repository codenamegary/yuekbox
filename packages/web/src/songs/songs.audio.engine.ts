export type AudioEngine = Readonly<{
  attach: (element: HTMLAudioElement) => void
  play: () => Promise<boolean>
  pause: () => void
  isPlaying: () => boolean
  isEnded: () => boolean
  currentTime: () => number
  duration: () => number
  seek: (seconds: number) => void
  bins: Float32Array
  subscribe: (listener: () => void) => () => void
}>

const binCount = 32

export const createAudioEngine = (): AudioEngine => {
  const bins = new Float32Array(binCount)
  const listeners = new Set<() => void>()
  const state: {
    element: HTMLAudioElement | null
    context: AudioContext | null
    analyser: AnalyserNode | null
    frame: number
    scratch: Uint8Array<ArrayBuffer> | null
  } = {
    element: null,
    context: null,
    analyser: null,
    frame: 0,
    scratch: null,
  }

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const isPlaying = () => {
    const element = state.element
    return element !== null && !element.paused && !element.ended
  }

  const isEnded = () => state.element?.ended ?? false

  const ensureGraph = () => {
    const element = state.element
    if (element === null || state.context !== null) return
    const context = new AudioContext()
    const source = context.createMediaElementSource(element)
    const analyser = context.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.72
    source.connect(analyser)
    analyser.connect(context.destination)
    state.context = context
    state.analyser = analyser
    state.scratch = new Uint8Array(analyser.frequencyBinCount)
  }

  const sample = () => {
    const analyser = state.analyser
    const scratch = state.scratch
    if (analyser === null || scratch === null) return
    analyser.getByteFrequencyData(scratch)
    const groupSize = Math.max(1, Math.floor(scratch.length / binCount))
    for (const index of bins.keys()) {
      const total = scratch
        .slice(index * groupSize, (index + 1) * groupSize)
        .reduce((sum, value) => sum + value, 0)
      const average = total / groupSize / 255
      const previous = bins[index] ?? 0
      bins[index] = previous * 0.55 + average * 0.45
    }
  }

  const idle = () => {
    for (const index of bins.keys()) {
      const previous = bins[index] ?? 0
      bins[index] = previous + (0.3 - previous) * 0.22
    }
  }

  const tick = () => {
    if (isPlaying()) {
      sample()
    } else {
      idle()
    }
    state.frame = requestAnimationFrame(tick)
  }

  const startLoop = () => {
    cancelAnimationFrame(state.frame)
    state.frame = requestAnimationFrame(tick)
  }

  const stopLoop = () => {
    cancelAnimationFrame(state.frame)
    state.frame = 0
  }

  const attach = (element: HTMLAudioElement) => {
    if (state.element === element) return
    state.element = element
    element.addEventListener("play", () => {
      startLoop()
      notify()
    })
    element.addEventListener("pause", () => {
      notify()
    })
    element.addEventListener("ended", () => {
      idle()
      notify()
    })
    element.addEventListener("loadedmetadata", notify)
    // A src swap aborts the old media without pause/ended; the snapshot must
    // not keep claiming the old song is still playing.
    element.addEventListener("emptied", notify)
    element.addEventListener("abort", notify)
    stopLoop()
    startLoop()
  }

  const play = async (): Promise<boolean> => {
    const element = state.element
    if (element === null) return false
    ensureGraph()
    const context = state.context
    if (context !== null) {
      if (context.state === "suspended") {
        await context.resume()
      }
      if (context.state !== "running") {
        return false
      }
    }
    if (!element.paused) {
      element.pause()
    }
    await element.play()
    return true
  }

  const pause = () => {
    state.element?.pause()
  }

  const currentTime = () => state.element?.currentTime ?? 0

  const duration = () => {
    const value = state.element?.duration ?? 0
    return Number.isFinite(value) ? value : 0
  }

  const seek = (seconds: number) => {
    const element = state.element
    if (element === null) return
    const limit = duration()
    if (limit <= 0) return
    element.currentTime = Math.max(0, Math.min(limit, seconds))
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return { attach, play, pause, isPlaying, isEnded, currentTime, duration, seek, bins, subscribe }
}
