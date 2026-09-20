export const visualizationSystemPrompt =
  "You are a creative JavaScript developer who writes canvas visualizations for music. " +
  "You answer with exactly one function expression and nothing else: no prose, no markdown, no commentary."

/**
 * A worked answer for the shapes we want most of the time: a dancing line that
 * tracks the spectrum, trailing the last frame, with the active lyric line
 * drawn underneath. It is an example, not a template to copy verbatim.
 */
export const visualizationExample = `(host) => {
  const ctx = host.canvas.getContext("2d")
  const hue = host.song.seed % 360
  let width = 1
  let height = 1
  let cue = null

  const drawLine = (frame, thickness, alpha) => {
    const wobble = frame.time * (1.2 + (frame.bins[0] ?? 0) * 3)
    ctx.beginPath()
    for (let step = 0; step <= 60; step += 1) {
      const ratio = step / 60
      const bin = frame.bins[Math.floor(ratio * (frame.bins.length - 1))] ?? 0
      const y = height / 2 + Math.sin(ratio * 6 + wobble) * 60 + (bin - 0.35) * height * 0.5
      if (step === 0) ctx.moveTo(ratio * width, y)
      else ctx.lineTo(ratio * width, y)
    }
    ctx.strokeStyle = "hsla(" + hue + ", 90%, 65%, " + alpha + ")"
    ctx.lineWidth = thickness
    ctx.stroke()
  }

  return {
    resize(size) {
      width = size.width
      height = size.height
    },

    renderLyricFrame(next) {
      cue = next
    },

    renderAudioFrame(frame) {
      // A translucent wash keeps a short trail behind the line.
      ctx.fillStyle = "rgba(2, 3, 10, 0.24)"
      ctx.fillRect(0, 0, width, height)

      drawLine(frame, 14, 0.12)
      drawLine(frame, 3, 0.9)

      if (cue !== null) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.92)"
        ctx.font = "600 42px system-ui, sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(cue.line, width / 2, height * 0.78)
      }
    },

    dispose() {},
  }
}`

/** The full authoring brief for one Song: the host contract, an example, the rules, the input. */
export const buildVisualizationPrompt = (input: {
  readonly style: string
  readonly lyrics: string
}): string => `Write ONE JavaScript function expression that draws a full-screen visualization for a song,
using Canvas 2D. It becomes the backdrop while the song plays.

The host calls it like this: const instance = factory({ canvas, song })

factory must be exactly one function expression of the form (host) => { ... }, with no imports,
no markdown fences, and no commentary around it. Return the bare expression itself: never assign
it to a variable, never name it, and never declare a named function.

host is:
- host.canvas: an HTMLCanvasElement you may call getContext("2d") on.
- host.song: { id, style, lyrics, seed }.

Return an object with exactly these methods:
- resize(size): called once on mount and on every window resize. size is
  { width, height, dpr }, all in CSS pixels.
- renderAudioFrame(frame): called every animation frame. frame is
  { time, duration, playing, bins, width, height, dpr }.
  - time and duration are seconds.
  - bins is a Float32Array of 32 normalized values from 0 to 1, low frequencies first.
  - width and height are CSS pixels, and the host has already scaled the context by dpr, so
    draw in CSS pixels and never touch canvas.width/height or call setTransform.
- renderLyricFrame(cue): called when the active lyric line changes. cue is either null (no line
  active) or { line, section, startSeconds, endSeconds }. Store it and draw it from
  renderAudioFrame; the lyric must not linger after null.
- dispose(): called when the visualization is replaced or the song changes.

EXAMPLE — a dancing line that follows the spectrum and shows the current lyric. Use this shape,
but make the result your own; do not return this exact code:

${visualizationExample}

Rules:
- Draw on every renderAudioFrame call and react to bins so the picture moves with the music.
- Use host.song.seed for per-song variation (palette, geometry, motion).
- Use host.song.style and host.song.lyrics as the visual direction.
- Only standard JavaScript built-ins and the 2D context methods exist. There is no
  Math.seedrandom, no canvas helper libraries, and no host methods beyond the four above.
- No DOM access beyond host.canvas, no window/document/globalThis, no timers, no network,
  no imports, no eval. The code runs on the page's main thread.
- Keep it self-contained: everything the instance needs lives in the factory closure.

SONG STYLE:
${input.style.trim()}

SONG LYRICS:
${input.lyrics.trim()}
`
