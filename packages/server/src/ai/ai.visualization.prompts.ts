export const visualizationSystemPrompt =
  "You are a creative JavaScript developer who writes canvas visualizations for music. " +
  "You answer with exactly one function expression and nothing else: no prose, no markdown, no commentary."

/**
 * Descriptive color moods, sampled one per authoring call: groupings like
 * "warm yellows" instead of exact codes, so the author reads an atmosphere
 * rather than a hex list.
 */
const paletteMoods: readonly string[] = [
  "warm yellows and honey",
  "bright whites",
  "a full rainbow",
  "fall colors: rust, burnt orange, and gold",
  "deep ocean blues and greens",
  "neon pinks and electric cyans",
  "purple twilight and indigo",
  "candlelight amber and smoke",
  "emerald and deep forest green",
  "blood red and obsidian",
  "silver and moonlight grey",
  "peach, coral, and sunset pink",
  "electric blue and chrome",
  "temple red and gold leaf",
  "mint, seafoam, and pale aqua",
  "dusty rose and mauve",
  "acid green and ultraviolet",
  "sand, clay, and terracotta",
  "ice white and glacier blue",
  "blacklight glow: violet, lime, and magenta",
]

const pickOne = <T>(items: readonly T[], random: () => number): T => {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length))
  const picked = items[index]
  if (picked === undefined) throw new Error("the palette moods must not be empty")
  return picked
}

/** Samples one descriptive color mood for the Song. */
export const sampleVisualizerPalette = (random: () => number = Math.random): string =>
  pickOne(paletteMoods, random)

/**
 * Directions of motion, sampled one per authoring call: the flow of the whole
 * piece, from a slow drift to a collapse and bloom.
 */
const motionDirections: readonly string[] = [
  "everything flows outward from the center",
  "everything converges inward to a point",
  "drift steadily left to right and wrap around",
  "drift steadily right to left and wrap around",
  "everything falls like rain",
  "everything rises like smoke",
  "the whole plane rotates slowly clockwise",
  "the whole plane rotates slowly counterclockwise",
  "counter-rotating layers, one clockwise and one counterclockwise",
  "spiral outward clockwise from the center",
  "spiral inward counterclockwise",
  "ripples spreading outward from a new origin",
  "radial rays breathing in and out",
  "horizontal bands shearing sideways",
  "columns of light flowing upward",
  "converge to a horizon line, then spill over it",
  "orbit slowly around an off-center point",
  "flex and fold along one diagonal",
  "a tide-like swell rising from the bottom edge",
  "scatter outward, then gather back on a slow inhale",
  "march in lockstep in one direction",
  "drift like dust in a slow wind",
  "unfurl from a single line into a full field",
  "collapse to a single point, then bloom outward",
]

/** Samples one direction of motion for the Song. */
export const sampleVisualizerDirection = (random: () => number = Math.random): string =>
  pickOne(motionDirections, random)

/**
 * The Winamp-era visualizer brief: psychedelic patterns, color shifts, kinetic
 * response to the music, and a spiritual undertone. It replaces the
 * stick-figure brief for this experiment.
 */
export const buildVisualizationPrompt = (
  input: {
    readonly style: string
    readonly lyrics: string
  },
  random: () => number = Math.random,
): string => {
  const palette = sampleVisualizerPalette(random)
  const direction = sampleVisualizerDirection(random)
  return `Write ONE JavaScript function expression that draws a full-screen visualizer for a song,
using Canvas 2D.

The host calls it like this: const instance = factory({ canvas, song, cues })

factory must be exactly one function expression of the form (host) => { ... }, with no imports,
no markdown fences, and no commentary around it. Return the bare expression itself: never assign
it to a variable, never name it, and never declare a named function.

host is:
- host.canvas: an HTMLCanvasElement you may call getContext("2d") on.
- host.song: { id, style, lyrics, seed }.
- host.cues: every timed lyric line, earliest first, as { text, startSeconds, endSeconds }. It may
  be empty. Work out which line is active from frame.time yourself, and draw it from
  renderAudioFrame. Nothing else notifies you when a line changes.

Return an object with exactly these methods:
- resize(size): called once on mount and on every window resize. size is
  { width, height, dpr }, all in CSS pixels.
- renderAudioFrame(frame): called every animation frame. frame is
  { time, duration, playing, bins, width, height, dpr }.
  - time and duration are seconds.
  - bins is a Float32Array of 32 normalized values from 0 to 1, low frequencies first.
  - width and height are CSS pixels, and the host has already scaled the context by dpr, so
    draw in CSS pixels and never touch canvas.width/height or call setTransform.
- dispose(): called when the visualization is replaced or the song changes.

TEMPLATE — the required shape, with the visual still to be written:

(host) => {
  const ctx = host.canvas.getContext("2d")
  let width = 1
  let height = 1

  return {
    resize(size) {
      width = size.width
      height = size.height
    },

    renderAudioFrame(frame) {
      // Draw the pattern: light, motion, and the active lyric line.
    },

    dispose() {},
  }
}

SONG STYLE:
${input.style.trim()}

SONG LYRICS:
${input.lyrics.trim()}

THE MEDIUM
- Visual Interest.
- Variety - the scene should evolve as the song progresses.
- Respond to the music.
- Keep motion continuous and smooth.
- Use jitters and glitches for effect, if the song calls for it.
- Surprise and delight.
- Nothing flat or corporate: no logos, no diagrams, no UI.

DIRECTION — sampled for this Song; follow it literally:
- motion: ${direction}

PALETTE — sampled for this Song; follow it literally:
- palette: ${palette}

Rules:
- Draw on every renderAudioFrame call and react to bins so the picture moves with the music.
- Motion is smooth by default. Save shaking and vibration for a rare accent on a big bass hit,
  never as a constant tremor.
- The palette is the atmosphere of the whole piece but you are free to augment and change and improvise.
- Lyrics live in host.cues.
- host.song.seed is a tiebreaker for constants, nothing more.
- Use host.song.style and host.song.lyrics to as inspiration.
- Only standard JavaScript built-ins and the 2D context methods exist. There is no
  Math.seedrandom, no canvas helper libraries, and no host methods beyond canvas, song, and cues.
- No DOM access beyond host.canvas, no window/document/globalThis, no timers, no network,
  no imports, no eval. The code runs on the page's main thread.
- Keep it self-contained: everything the instance needs lives in the factory closure.

`
}
