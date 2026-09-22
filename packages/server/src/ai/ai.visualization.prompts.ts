import { SongAnalysis } from "contracts/http/visualizations"

export const visualizationSystemPrompt =
  "You are a creative JavaScript developer who writes canvas visualizations for music. " +
  "You answer with exactly one function expression and nothing else: no prose, no markdown, no commentary."

/**
 * A worked answer that shows the host contract end to end: init, resize, the
 * cue lookup, the measured beat grid, section changes, and a spectrum-driven
 * frame. The drawing strategy for a given Song comes from the sampled
 * DIRECTION, so this is a contract demo, not a template.
 */
export const visualizationExample = `(host) => {
  const ctx = host.canvas.getContext("2d")
  const hue = host.song.seed % 360
  const cues = host.cues
  const analysis = host.analysis
  const beats = analysis === null ? [] : analysis.beats
  const notes = analysis === null ? [] : analysis.notes
  const sections = analysis === null ? [] : analysis.sections
  let width = 1
  let height = 1
  let lastBeatTime = -1

  // The Song's own timeline. Everything is indexed by frame.time in seconds.
  const cueAt = (time) => {
    let found = null
    for (const cue of cues) {
      if (cue.startSeconds > time) break
      found = cue
    }
    return found !== null && time < found.endSeconds ? found : null
  }
  const beatAt = (time) => {
    let found = null
    for (const beat of beats) {
      if (beat.time > time) break
      found = beat
    }
    return found
  }
  const sectionAt = (time) => {
    let found = null
    for (const section of sections) {
      if (section.startSeconds > time) break
      found = section
    }
    return found !== null && time < found.endSeconds ? found : null
  }
  const soundingNotes = (time) => {
    let count = 0
    for (const note of notes) {
      if (note.startSeconds > time) break
      if (note.endSeconds > time) count += 1
    }
    return count
  }

  return {
    resize(size) {
      width = size.width
      height = size.height
    },

    renderAudioFrame(frame) {
      const cue = cueAt(frame.time)
      const beat = beatAt(frame.time)
      const section = sectionAt(frame.time)
      const onBeat = beat !== null && beat.time !== lastBeatTime
      lastBeatTime = beat === null ? lastBeatTime : beat.time

      // A translucent wash keeps a short trail behind the line.
      ctx.fillStyle = "rgba(2, 3, 10, 0.24)"
      ctx.fillRect(0, 0, width, height)

      const sectionAge = section === null ? 0 : frame.time - section.startSeconds
      const voices = soundingNotes(frame.time)
      const swell = voices === 0 ? 60 : 60 + voices * 14 + (onBeat ? 40 : 0)
      const wobble = Math.sin(sectionAge * 1.5) * 30

      ctx.beginPath()
      for (let step = 0; step <= 60; step += 1) {
        const ratio = step / 60
        const bin = frame.bins[Math.floor(ratio * (frame.bins.length - 1))] ?? 0
        const y = height / 2 + wobble + Math.sin(ratio * 6 + sectionAge) * swell * bin
        if (step === 0) ctx.moveTo(ratio * width, y)
        else ctx.lineTo(ratio * width, y)
      }
      ctx.strokeStyle = "hsla(" + hue + ", 90%, 65%, 0.9)"
      ctx.lineWidth = 3
      ctx.stroke()

      if (cue !== null) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.92)"
        ctx.font = "600 42px system-ui, sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(cue.text, width / 2, height * 0.78)
      }
    },

    dispose() {},
  }
}`

/**
 * The direction axes. They are orthogonal on purpose: a subject, a motion
 * grammar, a composition, a way of making marks, a palette logic, a lyric
 * treatment, and an event rule cannot water each other down the way a single
 * long adjective soup does. One value is sampled per axis on every authoring
 * call, so consecutive Songs do not collapse into the same picture.
 */
const subjectHints: readonly string[] = [
  "laboratory bench",
  "weather station",
  "tide chart",
  "seismograph",
  "heart monitor",
  "oscilloscope",
  "typewriter",
  "printing press",
  "loom",
  "abacus",
  "orrery",
  "clock tower",
  "elevator bank",
  "aquarium",
  "aviary",
  "insect swarm",
  "murmuration",
  "school of fish",
  "jellyfish",
  "coral reef",
  "root system",
  "forest canopy",
  "wheat field in wind",
  "rain on glass",
  "snowdrift",
  "sand dune",
  "glacier",
  "lava lamp",
  "bonfire",
  "fireworks",
  "sparks from a grinder",
  "neon sign",
  "faulty fluorescent tube",
  "marquee lights",
  "traffic lights at night",
  "city skyline",
  "subway map",
  "highway interchange",
  "airport runway",
  "vending machine",
  "arcade cabinet",
  "pinball table",
  "sundial",
  "contour map",
  "chessboard",
  "dominoes",
  "stained glass",
  "kaleidoscope",
  "zoetrope",
  "film strip",
  "slide projector",
  "X-ray",
  "sonogram",
  "ticker tape",
  "library stacks",
  "assembly line",
  "robot arm",
  "antenna array",
  "power lines",
  "wind turbine",
  "lighthouse",
  "train yard",
  "metronome",
  "music box",
  "player piano",
  "carousel",
  "ferris wheel",
  "pendulum",
  "magnet and iron filings",
  "plasma globe",
  "ant farm",
  "beehive",
  "spiderweb",
  "honeycomb",
  "moth",
  "fireflies",
  "crows",
  "bioluminescence",
  "tide pool",
  "kelp forest",
  "dust storm",
  "blizzard",
  "aurora",
  "meteor shower",
  "observatory",
  "server rack",
  "terminal window",
  "window blinds",
  "revolving door",
  "marble run",
  "lottery balls",
  "roulette wheel",
  "shuffled cards",
  "hall of mirrors",
  "shadow puppets",
  "drive-in screen",
  "stage curtain",
  "orchestra pit",
  "sheet music",
  "piano roll",
  "guitar strings",
  "whale fall",
  "cat's cradle",
  "ship's rigging",
]

const motionHints: readonly string[] = [
  "everything falls straight down",
  "everything rises like heat",
  "drift left to right with wrap-around",
  "orbit a point that is off-canvas",
  "pulse in place, nothing travels",
  "pendulum swing from the top edge",
  "jellyfish pulse, then glide, then pulse",
  "flocking, each element steers toward neighbors",
  "attract toward one point, scatter on every lyric change",
  "repel from an off-center origin",
  "one sweep line that scans the frame forever",
  "ripple spreading from a new origin each frame",
  "rotate the whole plane slowly",
  "two counter-rotating halves",
  "parallax scroll in vertical layers",
  "snap and jerk, no easing",
  "breathe: slow scale up and down",
  "march in lockstep",
  "conveyor belt carrying everything",
  "rain with wind shear",
  "magnetic field lines flexing",
  "dominoes toppling in sequence",
  "accordion fold and unfold",
  "zipper closing",
  "curtains parting",
  "ink diffusing in water",
  "smoke plume",
  "flame flicker",
  "radar sweep with afterglow",
  "high bins cause vibration, nothing else moves",
  "slow dissolve, then reform",
  "moth flight: fast erratic darts with pauses",
]

const compositionHints: readonly string[] = [
  "one full-bleed shape",
  "a single thin horizon",
  "centered and symmetrical",
  "violently off-center",
  "everything crammed into one corner",
  "a narrow vertical slit",
  "letterboxed bars",
  "a grid of identical cells",
  "concentric rings",
  "nested rectangles",
  "one diagonal only",
  "triangles only",
  "arcs only",
  "half the canvas stays empty",
  "frame border only",
  "a single center dot",
  "ruled paper",
  "columns of text",
  "a spiral",
  "a maze",
  "stacked horizontal bands",
  "radial spokes",
  "a large X",
  "a rectangle that never moves while everything else does",
  "one element at a time, replaced every second",
  "horizon in the top third",
  "a path that folds back over itself",
  "a stage with everything pinned to the bottom edge",
]

const markHints: readonly string[] = [
  "fills only, no strokes",
  "strokes only, hairline",
  "line width varies wildly",
  "thousands of dots",
  "lines that run off-screen",
  "letterforms as the only geometry",
  "pixel blocks snapped to a coarse grid",
  "soft radial gradients only",
  "hard edges, no gradients",
  "one path per frame",
  "circles only, no other shape",
  "text repeated until it becomes texture",
  "clipping masks and cutouts",
  "overlap with globalCompositeOperation = 'lighter'",
  "difference or invert blending",
  "scanlines with a small offset",
  "halftone dots",
  "film grain",
  "chromatic offset: the same shape drawn three times, RGB-fanned",
  "long-exposure smears",
  "rubber-stamp repetition",
  "one-pixel lines",
  "punched holes",
  "torn paper edges",
  "arrows and vector diagrams",
  "wet ink bleeding into paper",
  "glossy plastic highlights",
  "chalk on a blackboard",
]

const paletteHints: readonly string[] = [
  "paper white background, black ink",
  "one hue, many values",
  "two colors, no blending",
  "three colors, strict split",
  "monochrome plus one accent",
  "acid neon on near-black",
  "pastel and high key",
  "earth tones",
  "blueprint blue on white",
  "amber CRT",
  "risograph with one off-register color",
  "fully saturated only",
  "nearly gray only",
  "color changes only on lyric change",
  "color follows frequency, low is red, high is violet",
  "inverted: dark marks on a light ground",
  "element count sets the color",
  "every element its own hue",
  "white marks on black, nothing else",
  "no background, marks over whatever is behind",
  "two-tone checkerboard logic",
  "sun-bleached film stock",
  "gold leaf on deep blue",
  "hospital green and chrome",
]

const lyricHints: readonly string[] = [
  "large and centered",
  "pinned to the bottom edge",
  "sitting on the horizon",
  "one word at a time, flashing",
  "letters scatter on line change",
  "typewriter reveal, left to right",
  "marquee scroll",
  "outline text only",
  "text on a wiggling path",
  "text clipped inside a moving shape",
  "mirrored on the floor below",
  "tiny and repeated as a pattern",
  "the text draws the shape itself",
  "diagonal baseline",
  "vibrates with the bass",
  "erased letter by letter when the line ends",
  "slides in from a random edge",
  "hard drop shadow, rubber stamp",
  "letter-spaced to fill the width",
  "hidden except during chorus sections",
  "set as a vertical column reading down",
  "stacked in a corner like credits",
]

const eventHints: readonly string[] = [
  "every line change triggers one pulse",
  "every section change swaps the palette",
  "every chorus adds one more layer",
  "the last ten seconds slow everything down",
  "the song's midpoint causes a one-time reversal",
  "a bass spike launches a burst, at most three per song",
  "the first frame is empty, content accumulates",
  "when the lyric is null the canvas empties",
  "each new line removes one element and adds one",
  "one full-canvas wipe every eight seconds",
  "the geometry flips once per section",
  "elements die when the song ends",
]

/** One value per axis, drawn fresh for every authoring call. */
export type VisualizationDirection = Readonly<{
  subject: string
  motion: string
  composition: string
  marks: string
  palette: string
  lyric: string
  event: string
}>

const pickOne = <T>(items: readonly T[], random: () => number): T => {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length))
  const picked = items[index]
  if (picked === undefined) throw new Error("the direction axes must not be empty")
  return picked
}

/** Samples one value per axis so consecutive Songs never share a whole approach. */
export const sampleVisualizationDirection = (
  random: () => number = Math.random,
): VisualizationDirection => ({
  subject: pickOne(subjectHints, random),
  motion: pickOne(motionHints, random),
  composition: pickOne(compositionHints, random),
  marks: pickOne(markHints, random),
  palette: pickOne(paletteHints, random),
  lyric: pickOne(lyricHints, random),
  event: pickOne(eventHints, random),
})

const directionBlock = (direction: VisualizationDirection): string =>
  [
    `- subject: ${direction.subject}`,
    `- motion: ${direction.motion}`,
    `- composition: ${direction.composition}`,
    `- marks: ${direction.marks}`,
    `- palette: ${direction.palette}`,
    `- lyric: ${direction.lyric}`,
    `- event: ${direction.event}`,
  ].join("\n")

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? null
  const left = sorted[middle - 1]
  const right = sorted[middle]
  return left === undefined || right === undefined ? null : (left + right) / 2
}

const round1 = (value: number): string => value.toFixed(1)

/**
 * A compact summary of a completed Song's measured score for the author, or ""
 * when no transcript exists yet. The first authoring pass runs before the Song
 * is rendered, so this only ever appears on a reroll.
 */
export const visualizationAnalysisBlock = (analysis: SongAnalysis | null): string => {
  if (analysis === null) return ""
  const { notes, beats, sections } = analysis
  const lastMoment = Math.max(
    0,
    ...notes.map((note) => note.endSeconds),
    ...beats.map((beat) => beat.time),
    ...sections.map((section) => section.endSeconds),
  )

  const lines: string[] = [`- last measured moment: ${round1(lastMoment)} s`]

  const periods: number[] = []
  for (let index = 1; index < beats.length; index += 1) {
    const previous = beats[index - 1]
    const current = beats[index]
    if (previous === undefined || current === undefined) continue
    const period = current.time - previous.time
    if (period > 0) periods.push(period)
  }
  const beatPeriod = median(periods)
  if (beatPeriod !== null) lines.push(`- tempo: about ${round1(60 / beatPeriod)} bpm`)

  const meterCounts = new Map<string, number>()
  for (const beat of beats) {
    const meter = `${beat.beatsPerBar}/${beat.beatUnit}`
    meterCounts.set(meter, (meterCounts.get(meter) ?? 0) + 1)
  }
  const meter = [...meterCounts.entries()].toSorted((left, right) => right[1] - left[1])[0]?.[0]
  if (meter !== undefined) lines.push(`- meter: ${meter}`)

  const sectionLimit = 24
  if (sections.length > 0) {
    const described = sections
      .slice(0, sectionLimit)
      .map(
        (section) =>
          `${section.name} ${round1(section.startSeconds)}-${round1(section.endSeconds)}`,
      )
      .join(", ")
    const more =
      sections.length > sectionLimit ? `, and ${sections.length - sectionLimit} more` : ""
    lines.push(`- structure: ${described}${more}`)
  }

  if (notes.length > 0) {
    const bucketSeconds = 30
    const buckets = Math.max(1, Math.ceil(lastMoment / bucketSeconds))
    const counts = Array.from({ length: buckets }, () => 0)
    for (const note of notes) {
      const index = Math.min(buckets - 1, Math.floor(note.startSeconds / bucketSeconds))
      counts[index] = (counts[index] ?? 0) + 1
    }
    const first = notes[0]
    const last = notes[notes.length - 1]
    const span =
      first === undefined || last === undefined
        ? ""
        : ` between ${round1(first.startSeconds)} s and ${round1(last.endSeconds)} s`
    lines.push(`- vocal notes: ${notes.length}${span}`)
    lines.push(`- notes per 30 s: ${counts.join(", ")}`)
  }

  return `
MEASURED SCORE: the rendered audio was transcribed. Use it to choose a strategy. The running
visual receives the same data as host.analysis. These numbers describe this Song, they are not
a script to hardcode:

${lines.join("\n")}
`
}

/** The full authoring brief for one Song: the host contract, a direction, the rules, the input. */
export const buildVisualizationPrompt = (
  input: {
    readonly style: string
    readonly lyrics: string
    readonly analysis: SongAnalysis | null
  },
  random: () => number = Math.random,
): string => {
  const direction = sampleVisualizationDirection(random)
  const analysisBlock = visualizationAnalysisBlock(input.analysis)
  return `Write ONE JavaScript function expression that draws a full-screen visualization for a song,
using Canvas 2D. It becomes the backdrop while the song plays.

The host calls it like this: const instance = factory({ canvas, song, cues, analysis })

factory must be exactly one function expression of the form (host) => { ... }, with no imports,
no markdown fences, and no commentary around it. Return the bare expression itself: never assign
it to a variable, never name it, and never declare a named function.

host is:
- host.canvas: an HTMLCanvasElement you may call getContext("2d") on.
- host.song: { id, style, lyrics, seed }.
- host.cues: every timed lyric line, earliest first, as { text, startSeconds, endSeconds }. It may
  be empty. Work out which line is active from frame.time yourself, and draw it from
  renderAudioFrame. Nothing else notifies you when a line changes.
- host.analysis: the measured score of the rendered audio, or null when the Song has none. It is
  { notes, beats, sections }:
  - notes: { startSeconds, endSeconds, pitch } with pitch as a MIDI note number, earliest first.
  - beats: { time, position, beatsPerBar, beatUnit }, earliest first. position 1 is a downbeat.
  - sections: { name, startSeconds, endSeconds } with labels like intro, verse, or chorus.
  Any of the three may be empty. The times are measured against the audio, so frame.time indexes
  into them directly. Use them to anticipate: a downbeat, a held note, and a section change are
  all known before they arrive.

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

EXAMPLE — a dancing line that follows the spectrum, leans on the measured beat grid, and shows
the current lyric. The example shows how the host contract is used, not the style to copy. Your
drawing strategy comes from the DIRECTION block below:

${visualizationExample}

DIRECTION — follow it literally; do not blend in other directions:

${directionBlock(direction)}
${analysisBlock}
Rules:
- Draw on every renderAudioFrame call and react to bins so the picture moves with the music.
- Follow the DIRECTION; it is the drawing strategy. Do not fall back on the example's dancing
  line, and do not just rotate its hue.
- Lyrics live in host.cues. Show them when the DIRECTION calls for lyric treatment, and never
  assume the host hands you a line.
- host.song.seed is a tiebreaker for constants, nothing more.
- Use host.song.style and host.song.lyrics to shade the details, not to change the DIRECTION's
  strategy.
- Only standard JavaScript built-ins and the 2D context methods exist. There is no
  Math.seedrandom, no canvas helper libraries, and no host methods beyond canvas, song, cues,
  and analysis.
- No DOM access beyond host.canvas, no window/document/globalThis, no timers, no network,
  no imports, no eval. The code runs on the page's main thread.
- Keep it self-contained: everything the instance needs lives in the factory closure.
- Never fall back on these cliches: glowing dots on a dark background, mirrored waveform bars,
  a circular equalizer, a symmetric particle starburst, or hue cycling with time.

SONG STYLE:
${input.style.trim()}

SONG LYRICS:
${input.lyrics.trim()}
`
}
