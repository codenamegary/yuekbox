import { cleanAgentText } from "./ai.prompts"

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const fencedAnywhere = /```[a-zA-Z0-9]*\n([\s\S]*?)```/

const stripWrapping = (raw: string): string => {
  const cleaned = cleanAgentText(raw)
  const wrapped = /^```[a-zA-Z0-9]*\n([\s\S]*?)\n?```$/.exec(cleaned)
  if (wrapped?.[1] !== undefined) return wrapped[1].trim()
  const block = fencedAnywhere.exec(cleaned)
  if (block?.[1] !== undefined) return block[1].trim()
  return cleaned
}

/** Compile the candidate to a factory. Function expressions evaluate with no side effects. */
const compilesToFunction = (code: string): boolean => {
  try {
    const candidate: unknown = new Function(`return (${code})`)()
    return typeof candidate === "function"
  } catch {
    return false
  }
}

/** Slice from `start` through the brace that closes the first block inside it. */
const balancedFrom = (text: string, start: number): string | null => {
  const open = text.indexOf("{", start)
  if (open === -1) return null
  let depth = 0
  for (let index = open; index < text.length; index += 1) {
    const char = text[index]
    if (char === "{") {
      depth += 1
    } else if (char === "}") {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1).trim()
    }
  }
  return null
}

/**
 * Every plausible end for an expression starting at `start`: the balanced brace
 * slice, the rest of the text, and the rest trimmed back to its last `)` so
 * commentary after an object-bodied arrow falls away.
 */
const candidatesFrom = (text: string, start: number): readonly string[] => {
  const options: string[] = []
  const balanced = balancedFrom(text, start)
  if (balanced !== null) options.push(balanced)

  const rest = text.slice(start).replace(/;\s*$/, "").trim()
  options.push(rest)

  const lastClose = rest.lastIndexOf(")")
  if (lastClose !== -1 && rest.slice(lastClose + 1).trim() !== "") {
    options.push(rest.slice(0, lastClose + 1))
  }
  return options
}

/**
 * The replies models actually send: a bare expression, but also `const factory =
 * (host) => {...};`, `export default ...`, a named function declaration, or any
 * of those buried in prose. Return the bare function expression, or null.
 */
export const normalizeVisualizationCode = (raw: string): string | null => {
  const text = stripWrapping(raw)
  if (text === "") return null

  const candidates: string[] = [text.replace(/;\s*$/, "").trim()]

  const exported = /export\s+default\s+/.exec(text)
  if (exported !== null) {
    candidates.push(...candidatesFrom(text, exported.index + exported[0].length))
  }

  const assigned = /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s+/.exec(text)
  if (assigned !== null) {
    candidates.push(...candidatesFrom(text, assigned.index + assigned[0].length))
  }

  const declared = /(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.exec(text)
  if (declared !== null) {
    for (const option of candidatesFrom(text, declared.index)) candidates.push(`(${option})`)
  }

  const arrow = text.indexOf("(host)")
  if (arrow !== -1) {
    candidates.push(...candidatesFrom(text, arrow))
  }

  for (const candidate of candidates) {
    if (compilesToFunction(candidate)) return candidate
  }
  return null
}

export type VisualizationSmokeResult = Readonly<{ ok: true } | { ok: false; detail: string }>

type SmokeInstance = Readonly<{
  resize: (size: unknown) => unknown
  renderAudioFrame: (frame: unknown) => unknown
  dispose: () => unknown
}>

const asSmokeInstance = (value: unknown): SmokeInstance | null => {
  if (typeof value !== "object" || value === null) return null
  const candidate = value as Partial<SmokeInstance>
  if (
    typeof candidate.resize !== "function" ||
    typeof candidate.renderAudioFrame !== "function" ||
    typeof candidate.dispose !== "function"
  ) {
    return null
  }
  return {
    resize: candidate.resize,
    renderAudioFrame: candidate.renderAudioFrame,
    dispose: candidate.dispose,
  }
}

/**
 * Globals the contract forbids. They are shadowed to undefined while the code
 * is smoke run, so timer, DOM, and network calls fail loudly instead of hanging
 * or leaking. This is best-effort, not a sandbox.
 */
const blockedGlobals: readonly string[] = [
  "window",
  "document",
  "globalThis",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "Worker",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "navigator",
  "location",
  "eval",
  "Function",
  "importScripts",
  "postMessage",
  "Audio",
  "Image",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "queueMicrotask",
  "process",
  "Bun",
  "require",
]

const makeFactory = (code: string): unknown =>
  new Function(...blockedGlobals, `return (${code})`)(...blockedGlobals.map(() => undefined))

type StubGradient = Readonly<{ addColorStop: (offset: number, color: string) => void }>

type StubContext = Readonly<{
  createLinearGradient: (...args: number[]) => StubGradient
  createRadialGradient: (...args: number[]) => StubGradient
  measureText: (text: string) => Readonly<{ width: number }>
  getImageData: (...args: number[]) => Readonly<{ data: Uint8ClampedArray }>
}>

type StubCanvas = Readonly<{
  width: number
  height: number
  clientWidth: number
  clientHeight: number
  getContext: (contextId: string) => StubContext
}>

const stubContext = (): StubContext => {
  const gradient: StubGradient = { addColorStop: () => {} }
  const values = new Map<string, unknown>()
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property === "symbol") return undefined
        if (property === "createLinearGradient" || property === "createRadialGradient") {
          return () => gradient
        }
        if (property === "measureText") return () => ({ width: 10 })
        if (property === "getImageData") return () => ({ data: new Uint8ClampedArray(4) })
        return values.get(property) ?? (() => undefined)
      },
      set: (_target, property, value) => {
        values.set(String(property), value)
        return true
      },
    },
  ) as unknown as StubContext
}

/**
 * Runs the factory against a stub canvas for one frame, with a cue and a small
 * measured score on the host. This is what catches replies that parse but call
 * APIs that do not exist, so they retry instead of landing as a visual that
 * dies on the page.
 */
export const smokeVisualization = (code: string): VisualizationSmokeResult => {
  let factory: unknown
  try {
    factory = makeFactory(code)
  } catch (error) {
    return { ok: false, detail: `the code did not compile: ${messageOf(error)}` }
  }
  if (typeof factory !== "function") {
    return { ok: false, detail: "the reply was not a function" }
  }

  const context = stubContext()
  const canvas: StubCanvas = {
    width: 640,
    height: 360,
    clientWidth: 640,
    clientHeight: 360,
    getContext: () => context,
  }

  try {
    const instance = asSmokeInstance(
      factory({
        canvas,
        song: { id: "smoke", style: "smoke test", lyrics: "smoke test", seed: 1 },
        cues: [{ text: "smoke test", startSeconds: 0, endSeconds: 1 }],
        analysis: {
          version: 1,
          source: "sheetsage2",
          notes: [{ startSeconds: 0, endSeconds: 1, pitch: 60 }],
          beats: [{ time: 0, position: 1, beatsPerBar: 4, beatUnit: 4 }],
          sections: [{ name: "intro", startSeconds: 0, endSeconds: 4 }],
        },
      }),
    )
    if (instance === null) {
      return { ok: false, detail: "the visualization is missing required methods" }
    }

    instance.resize({ width: 640, height: 360, dpr: 1 })
    instance.renderAudioFrame({
      time: 0.5,
      duration: 10,
      playing: true,
      bins: new Float32Array(32).fill(0.4),
      width: 640,
      height: 360,
      dpr: 1,
    })
    instance.dispose()
    return { ok: true }
  } catch (error) {
    return { ok: false, detail: `the visualization threw while drawing: ${messageOf(error)}` }
  }
}
