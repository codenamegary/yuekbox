import { describe, expect, test } from "bun:test"
import { LyricCue } from "./songs.lyrics.timing"
import {
  compileVisualization,
  createVisualizationEngine,
  VisualizationSong,
  VisualizationSource,
} from "./songs.visualization"

const song: VisualizationSong = {
  id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
  style: "pop",
  lyrics: "hello",
  seed: 7,
}

type Observatory = {
  frames: Array<Record<string, unknown>>
  resizes: Array<Record<string, unknown>>
  lyrics: Array<unknown>
  disposed: number
}

const observatory = (): Observatory => ({ frames: [], resizes: [], lyrics: [], disposed: 0 })

const modelCode = `(host) => {
  const ctx = host.canvas.getContext("2d")
  return {
    resize(size) { observatory.resizes.push(size) },
    renderAudioFrame(frame) {
      observatory.frames.push({
        time: frame.time,
        duration: frame.duration,
        playing: frame.playing,
        binsLength: frame.bins.length,
        width: frame.width,
        height: frame.height,
        dpr: frame.dpr,
        canvasWidth: host.canvas.width,
      })
    },
    renderLyricFrame(cue) { observatory.lyrics.push(cue) },
    dispose() { observatory.disposed += 1 },
  }
}`

const installObservatory = (): Observatory => {
  const value = observatory()
  ;(globalThis as unknown as { observatory: Observatory }).observatory = value
  return value
}

type FrameHost = Readonly<{
  step: () => void
  pending: () => number
}>

const installFrameHost = (): FrameHost => {
  const callbacks = new Map<number, FrameRequestCallback>()
  let handle = 0
  const raf = (callback: FrameRequestCallback): number => {
    handle += 1
    callbacks.set(handle, callback)
    return handle
  }
  const caf = (id: number): void => {
    callbacks.delete(id)
  }
  ;(globalThis as unknown as { requestAnimationFrame: typeof raf }).requestAnimationFrame = raf
  ;(globalThis as unknown as { cancelAnimationFrame: typeof caf }).cancelAnimationFrame = caf
  return {
    step: () => {
      const pending = [...callbacks.entries()]
      callbacks.clear()
      for (const [, callback] of pending) callback(0)
    },
    pending: () => callbacks.size,
  }
}

type WindowHost = Readonly<{
  dispatch: (type: string) => void
  listeners: (type: string) => number
}>

const installWindow = (): WindowHost => {
  const listeners = new Map<string, Set<() => void>>()
  const host = {
    devicePixelRatio: 2,
    addEventListener: (type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener)
    },
  }
  ;(globalThis as unknown as { window: typeof host }).window = host
  return {
    dispatch: (type) => {
      const set = listeners.get(type)
      if (set === undefined) return
      for (const listener of set) listener()
    },
    listeners: (type) => listeners.get(type)?.size ?? 0,
  }
}

const makeCanvas = (width = 640, height = 360) => {
  const transforms: number[][] = []
  const context = {
    setTransform: (...values: number[]) => {
      transforms.push(values)
    },
  } as unknown as CanvasRenderingContext2D
  const canvas = {
    clientWidth: width,
    clientHeight: height,
    width: 0,
    height: 0,
    getContext: () => context,
  }
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    raw: canvas,
    transforms,
  }
}

const makeSource = (time: { value: number }, bins: Float32Array): VisualizationSource => ({
  time: () => time.value,
  duration: () => 120,
  isPlaying: () => true,
  bins: () => bins,
})

const cues: readonly LyricCue[] = [
  { text: "first line", section: "Verse", startSeconds: 1, endSeconds: 4 },
  { text: "second line", section: "Chorus", startSeconds: 4, endSeconds: 8 },
]

describe("compileVisualization", () => {
  test("compiles a function expression into a factory", () => {
    const factory = compileVisualization("(host) => ({ dispose() {} })")
    expect(typeof factory).toBe("function")
  })

  test("refuses code that is not a function", () => {
    expect(compileVisualization("42")).toBeNull()
  })

  test("refuses code that does not parse", () => {
    expect(compileVisualization("(host) => ({")).toBeNull()
  })
})

describe("createVisualizationEngine", () => {
  test("attach resizes, draws every frame, and reports lyric cues", () => {
    const frameHost = installFrameHost()
    const windowHost = installWindow()
    const observed = installObservatory()
    const { canvas, transforms } = makeCanvas()
    const time = { value: 0 }
    const bins = Float32Array.from([0.25, 0.5, 0.75])
    const engine = createVisualizationEngine(makeSource(time, bins))
    const failures: string[] = []
    const failing = createVisualizationEngine(makeSource(time, bins))

    expect(engine.attach({ canvas, song, code: modelCode, cues, onError: () => {} })).toBe(true)

    expect(observed.resizes).toEqual([{ width: 640, height: 360, dpr: 2 }])
    const scaled = canvas as unknown as { width: number; height: number }
    expect(scaled.width).toBe(1280)
    expect(scaled.height).toBe(720)

    time.value = 0.5
    frameHost.step()
    expect(observed.frames).toEqual([
      {
        time: 0.5,
        duration: 120,
        playing: true,
        binsLength: 3,
        width: 640,
        height: 360,
        dpr: 2,
        canvasWidth: 1280,
      },
    ])
    expect(transforms).toEqual([[2, 0, 0, 2, 0, 0]])
    expect(observed.lyrics).toEqual([])

    time.value = 2
    frameHost.step()
    expect(observed.lyrics).toEqual([
      { line: "first line", section: "Verse", startSeconds: 1, endSeconds: 4 },
    ])

    time.value = 5
    frameHost.step()
    expect(observed.lyrics.at(-1)).toEqual({
      line: "second line",
      section: "Chorus",
      startSeconds: 4,
      endSeconds: 8,
    })

    time.value = 20
    frameHost.step()
    expect(observed.lyrics.at(-1)).toBeNull()
    expect(observed.lyrics).toHaveLength(3)

    engine.detach()
    expect(observed.disposed).toBe(1)
    expect(windowHost.listeners("resize")).toBe(0)

    const framesAfterDetach = observed.frames.length
    frameHost.step()
    expect(observed.frames).toHaveLength(framesAfterDetach)

    expect(
      failing.attach({
        canvas,
        song,
        code: modelCode,
        cues,
        onError: (detail) => failures.push(detail),
      }),
    ).toBe(true)
    failing.detach()
    expect(failures).toEqual([])
  })

  test("a window resize re-measures the canvas and tells the instance", () => {
    installFrameHost()
    const windowHost = installWindow()
    installObservatory()
    const { canvas, raw } = makeCanvas(640, 360)
    const engine = createVisualizationEngine(makeSource({ value: 0 }, new Float32Array()))

    engine.attach({ canvas, song, code: modelCode, cues, onError: () => {} })
    raw.clientWidth = 800
    raw.clientHeight = 450
    windowHost.dispatch("resize")

    const observed = (globalThis as unknown as { observatory: Observatory }).observatory
    expect(observed.resizes.at(-1)).toEqual({ width: 800, height: 450, dpr: 2 })
    const scaled = canvas as unknown as { width: number; height: number }
    expect(scaled.width).toBe(1600)
    engine.detach()
  })

  test("a compile miss is reported and leaves the loop off", () => {
    installFrameHost()
    installWindow()
    const { canvas } = makeCanvas()
    const failures: string[] = []
    const engine = createVisualizationEngine(makeSource({ value: 0 }, new Float32Array()))

    expect(
      engine.attach({
        canvas,
        song,
        code: "not code",
        cues,
        onError: (detail) => failures.push(detail),
      }),
    ).toBe(false)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain("did not compile")
  })

  test("an instance missing renderAudioFrame is refused and reported", () => {
    installFrameHost()
    installWindow()
    const { canvas } = makeCanvas()
    const failures: string[] = []
    const engine = createVisualizationEngine(makeSource({ value: 0 }, new Float32Array()))

    expect(
      engine.attach({
        canvas,
        song,
        code: "(host) => ({ resize() {} })",
        cues,
        onError: (detail) => failures.push(detail),
      }),
    ).toBe(false)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain("missing required methods")
  })

  test("a throw stops the loop, disposes, and reports the detail", () => {
    const frameHost = installFrameHost()
    installWindow()
    const observed = installObservatory()
    const { canvas } = makeCanvas()
    const failures: string[] = []
    const time = { value: 0 }
    const engine = createVisualizationEngine(makeSource(time, new Float32Array()))
    const throwingCode = `(host) => ({
      resize() {},
      renderAudioFrame() { throw new Error("canvas exploded") },
      renderLyricFrame() {},
      dispose() { observatory.disposed += 1 },
    })`

    expect(
      engine.attach({
        canvas,
        song,
        code: throwingCode,
        cues,
        onError: (detail) => failures.push(detail),
      }),
    ).toBe(true)
    frameHost.step()

    expect(failures).toEqual(["canvas exploded"])
    expect(observed.disposed).toBe(1)
    frameHost.step()
    expect(failures).toHaveLength(1)
  })
})
