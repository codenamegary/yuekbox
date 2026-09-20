import { describe, expect, test } from "bun:test"
import { normalizeVisualizationCode, smokeVisualization } from "./ai.visualization.code"

const bare =
  "(host) => ({ resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} })"

const fullFactory = `(host) => {
  const ctx = host.canvas.getContext("2d")
  return {
    resize() {},
    renderAudioFrame() { ctx.fillRect(0, 0, 10, 10) },
    renderLyricFrame() {},
    dispose() {},
  }
}`

describe("normalizeVisualizationCode", () => {
  test("keeps a bare function expression", () => {
    expect(normalizeVisualizationCode(bare)).toBe(bare)
  })

  test("unwraps a const assignment, as Gemini likes to return", () => {
    expect(normalizeVisualizationCode(`const factory = ${bare}`)).toBe(bare)
    expect(normalizeVisualizationCode(`const factory = ${bare};`)).toBe(bare)
  })

  test("unwraps an export default", () => {
    expect(normalizeVisualizationCode(`export default ${bare}`)).toBe(bare)
  })

  test("wraps a named function declaration back into an expression", () => {
    const declared = `function factory(host) {
      return { resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} }
    }`

    const normalized = normalizeVisualizationCode(declared)

    expect(normalized).not.toBeNull()
    expect(smokeVisualization(normalized ?? "").ok).toBe(true)
  })

  test("takes the first fenced block out of surrounding prose", () => {
    const raw = `Sure! Here is the code:\n\`\`\`javascript\n${bare}\n\`\`\`\nEnjoy!`

    expect(normalizeVisualizationCode(raw)).toBe(bare)
  })

  test("finds an assignment after commentary and stops at its closing brace", () => {
    const raw = `Here you go:

const factory = (host) => {
  const ctx = host.canvas.getContext("2d")
  return {
    resize() {},
    renderAudioFrame() { ctx.fillRect(0, 0, 10, 10) },
    renderLyricFrame() {},
    dispose() {},
  }
};

Let me know if you want a different palette.`

    const normalized = normalizeVisualizationCode(raw)

    expect(normalized).not.toBeNull()
    expect(smokeVisualization(normalized ?? "").ok).toBe(true)
  })

  test("unwraps the shape Gemini actually returned in the wild", () => {
    const raw = `const factory = (host) => {
  const canvas = host.canvas;
  const ctx = canvas.getContext('2d');
  let size = { width: 0, height: 0, dpr: 1 };
  Math.seedrandom(host.song.seed);
  return { resize, renderAudioFrame, renderLyricFrame, dispose };
};`

    const normalized = normalizeVisualizationCode(raw)

    expect(normalized).not.toBeNull()
    expect(normalized?.startsWith("(host) =>")).toBe(true)
  })

  test("refuses prose", () => {
    expect(normalizeVisualizationCode("I cannot do that")).toBeNull()
  })

  test("refuses an expression that is not a function", () => {
    expect(normalizeVisualizationCode("42")).toBeNull()
  })

  test("refuses empty text", () => {
    expect(normalizeVisualizationCode("   ")).toBeNull()
  })
})

describe("smokeVisualization", () => {
  test("accepts a factory that draws a frame and a lyric", () => {
    expect(smokeVisualization(fullFactory)).toEqual({ ok: true })
  })

  test("rejects a factory that reaches for a missing helper, the Gemini failure", () => {
    const code = `(host) => {
      Math.seedrandom(host.song.seed);
      return { resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} }
    }`

    const result = smokeVisualization(code)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.detail).toContain("seedrandom")
  })

  test("rejects a factory that throws while drawing", () => {
    const code = `(host) => ({
      resize() {},
      renderAudioFrame() { throw new Error("no canvas today") },
      renderLyricFrame() {},
      dispose() {},
    })`

    const result = smokeVisualization(code)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.detail).toContain("no canvas today")
  })

  test("rejects an instance missing required methods", () => {
    const result = smokeVisualization("(host) => ({ resize() {} })")

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.detail).toContain("missing")
  })

  test("rejects an async factory that returns a promise", () => {
    const code = `async (host) => ({ resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} })`

    expect(smokeVisualization(code).ok).toBe(false)
  })

  test("rejects code that reaches for a timer", () => {
    const code = `(host) => ({
      resize() {},
      renderAudioFrame() { setTimeout(() => {}, 16) },
      renderLyricFrame() {},
      dispose() {},
    })`

    const result = smokeVisualization(code)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.detail).toContain("setTimeout")
  })

  test("allows the standard 2D context surface, gradients included", () => {
    const code = `(host) => {
      const ctx = host.canvas.getContext("2d")
      return {
        resize() {},
        renderAudioFrame() {
          const gradient = ctx.createLinearGradient(0, 0, 10, 10)
          gradient.addColorStop(0, "black")
          ctx.clearRect(0, 0, 10, 10)
          ctx.save()
          ctx.scale(1, 1)
          ctx.translate(0, 0)
          ctx.rotate(0.1)
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(10, 10)
          ctx.stroke()
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, 10, 10)
          ctx.fillText("hi", 5, 5)
          ctx.font = "12px sans-serif"
          ctx.textAlign = "center"
          ctx.restore()
        },
        renderLyricFrame() {},
        dispose() {},
      }
    }`

    expect(smokeVisualization(code)).toEqual({ ok: true })
  })
})
