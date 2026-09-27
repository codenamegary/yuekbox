import { ProvisionStepId } from "./provisioning.models"

/** Milliseconds between redraws; uv emits in bursts, so they coalesce. */
export const liveRedrawGapMs = 100

const eraseLine = "\r\x1b[2K"

const controlPattern = /\x1b\[[0-9;?]*[@-~]|\x1b\][^\u0007]*\u0007|[\u0000-\u001f\u007f]/g

/** Strips ANSI escapes and control characters from one line of child output. */
export const stripControl = (line: string): string => line.replace(controlPattern, "")

/** Cuts one live line to the terminal width, leaving room for the cursor. */
export const truncateLine = (text: string, columns: number): string =>
  text.slice(0, Math.max(0, columns - 1))

/** The live line: the step label plus the latest activity. */
export const liveLine = (label: string, activity: string): string => `  ${label} (${activity})...`

/**
 * Installer verbs in plain English, most specific first. `Downloading` means
 * bytes are moving; everything else uv prints while it works (`Resolved`,
 * `Prepared`, `Installed`, `Creating`, ...) means it is building the step.
 */
const activityVerbs: Readonly<ReadonlyArray<readonly [RegExp, string]>> = Object.freeze([
  [/download/, "downloading"],
  [/install|prepar|resolv|build|creat|audit/, "installing"],
])

/** The plain-English noun for each step that streams installer output. */
const activityNouns: Readonly<Partial<Record<ProvisionStepId, string>>> = Object.freeze({
  python: "the song engine",
  environment: "the song tools",
})

/**
 * Maps one raw installer line to its plain-English phrase, or null when the
 * line says nothing new. Raw uv lines carry banned words and version numbers;
 * the phrase never does, and parsing never fails the install.
 */
export const activityPhrase = (step: ProvisionStepId, rawLine: string): string | null => {
  const noun = activityNouns[step]
  if (noun === undefined) return null
  const line = stripControl(rawLine).toLowerCase()
  for (const [pattern, verb] of activityVerbs) {
    if (pattern.test(line)) return `${verb} ${noun}`
  }
  return null
}

/** Timer seam so redraw scheduling is testable without a real event loop. */
export type LiveTimers = Readonly<{
  set: (callback: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}>

export type LiveLineDeps = Readonly<{
  /** Whether stdout erases and redraws are safe: a TTY that is not `dumb`. */
  enabled: boolean
  /** The raw stdout writer; it writes control sequences and text, no newline. */
  write: (text: string) => void
  /** The millisecond clock for the redraw gap. */
  now: () => number
  /** The terminal width in columns; the live line truncates to `columns - 1`. */
  columns: number
  /** The minimum gap between redraws; bursts coalesce inside it. */
  gapMs: number
  timers: LiveTimers
}>

export type LiveLine = Readonly<{
  /** Names the step whose line the activity redraws. */
  begin: (label: string) => void
  /** Shows the latest activity for the current step; null keeps the last phrase. */
  update: (phrase: string | null) => void
  /** Erases the live line before durable output; safe to call any time. */
  clear: () => void
}>

/**
 * The one rewritten line. While a step runs, activity erases and redraws it in
 * place so the terminal never scrolls: immediately after the redraw gap has
 * passed, otherwise once on a short timer that carries the latest phrase.
 * A burst costs at most one redraw per gap.
 */
export const makeLiveLine = (deps: LiveLineDeps): LiveLine => {
  let label: string | null = null // structure: allow-let
  let phrase: string | null = null // structure: allow-let
  let drawn = false // structure: allow-let
  let lastDrawAt = Number.NEGATIVE_INFINITY // structure: allow-let
  let scheduled: unknown = null // structure: allow-let

  const cancelScheduled = () => {
    if (scheduled !== null) {
      deps.timers.clear(scheduled)
      scheduled = null
    }
  }

  const draw = () => {
    if (label === null || phrase === null) return
    deps.write(`${eraseLine}${truncateLine(liveLine(label, phrase), deps.columns)}`)
    drawn = true
    lastDrawAt = deps.now()
  }

  const flush = () => {
    scheduled = null
    draw()
  }

  return {
    begin: (next) => {
      label = next
      phrase = null
    },
    update: (next) => {
      if (!deps.enabled || next === null || label === null || next === phrase) return
      phrase = next
      if (scheduled !== null) return
      const wait = deps.gapMs - (deps.now() - lastDrawAt)
      if (wait <= 0) draw()
      else scheduled = deps.timers.set(flush, wait)
    },
    clear: () => {
      cancelScheduled()
      if (drawn) deps.write(eraseLine)
      drawn = false
      label = null
      phrase = null
    },
  }
}
