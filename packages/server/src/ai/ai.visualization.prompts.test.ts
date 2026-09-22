import { describe, expect, test } from "bun:test"
import {
  buildVisualizationPrompt,
  sampleVisualizationDirection,
  visualizationExample,
} from "./ai.visualization.prompts"

const input = {
  style: "glacial techno, 128 bpm, analog drone",
  lyrics: "[Verse]\ncold lights on the water\n[Chorus]\nI am still here",
  analysis: null,
}

describe("buildVisualizationPrompt", () => {
  test("embeds the Song's style and lyrics as creative direction", () => {
    const prompt = buildVisualizationPrompt(input)
    expect(prompt).toContain("glacial techno, 128 bpm, analog drone")
    expect(prompt).toContain("cold lights on the water")
  })

  test("states the host contract the code must satisfy", () => {
    const prompt = buildVisualizationPrompt(input)
    for (const member of ["resize", "renderAudioFrame", "dispose"]) {
      expect(prompt).toContain(member)
    }
    expect(prompt).toContain("host.canvas")
    expect(prompt).toContain("host.song")
    expect(prompt).toContain("host.cues")
    expect(prompt).toContain("host.analysis")
    expect(prompt).not.toContain("renderLyricFrame")
  })

  test("asks for one bare function expression", () => {
    const prompt = buildVisualizationPrompt(input)
    expect(prompt).toContain("one function expression")
    expect(prompt).toContain("no imports")
    expect(prompt).toContain("no markdown")
  })

  test("spells out the frame data, the lyric cue shape, and the measured score", () => {
    const prompt = buildVisualizationPrompt(input)
    expect(prompt).toContain("bins")
    expect(prompt).toContain("startSeconds")
    expect(prompt).toContain("beatsPerBar")
    expect(prompt).toContain("sections")
    expect(prompt).toContain("null")
  })

  test("demands the bare expression and warns off invented helpers", () => {
    const flat = buildVisualizationPrompt(input).replace(/\s+/g, " ")
    expect(flat).toContain("Return the bare expression itself: never assign it to a variable")
    expect(flat).toContain("Math.seedrandom")
  })

  test("carries a worked example that reads cues and the measured score", () => {
    const prompt = buildVisualizationPrompt(input)
    expect(prompt).toContain(visualizationExample)
    expect(visualizationExample).toContain("(host) =>")
    for (const member of ["resize", "renderAudioFrame", "dispose"]) {
      expect(visualizationExample).toContain(member)
    }
    expect(visualizationExample).toContain("host.cues")
    expect(visualizationExample).toContain("cue.text")
    expect(visualizationExample).toContain("hsla")
  })

  test("omits the measured score block when the Song has no analysis", () => {
    const prompt = buildVisualizationPrompt(input)

    expect(prompt).not.toContain("MEASURED SCORE")
  })

  test("summarizes the measured score when the Song completed", () => {
    const prompt = buildVisualizationPrompt({
      ...input,
      analysis: {
        version: 1,
        source: "sheetsage2",
        notes: [
          { startSeconds: 1, endSeconds: 1.5, pitch: 60 },
          { startSeconds: 2, endSeconds: 2.5, pitch: 64 },
          { startSeconds: 45, endSeconds: 46, pitch: 67 },
        ],
        beats: [
          { time: 0, position: 1, beatsPerBar: 4, beatUnit: 4 },
          { time: 0.5, position: 2, beatsPerBar: 4, beatUnit: 4 },
          { time: 1, position: 3, beatsPerBar: 4, beatUnit: 4 },
        ],
        sections: [{ name: "intro", startSeconds: 0, endSeconds: 8 }],
      },
    })

    expect(prompt).toContain("MEASURED SCORE")
    expect(prompt).toContain("about 120.0 bpm")
    expect(prompt).toContain("meter: 4/4")
    expect(prompt).toContain("intro 0.0-8.0")
    expect(prompt).toContain("vocal notes: 3")
    expect(prompt).toContain("last measured moment: 46.0 s")
  })

  test("injects a sampled direction covering every axis", () => {
    const direction = sampleVisualizationDirection(() => 0)
    const prompt = buildVisualizationPrompt(input, () => 0)
    expect(prompt).toContain("DIRECTION")
    for (const [axis, value] of Object.entries(direction)) {
      expect(prompt).toContain(`- ${axis}: ${value}`)
    }
  })

  test("samples a different value on every axis for different randoms", () => {
    const axes = ["subject", "motion", "composition", "marks", "palette", "lyric", "event"] as const
    const first = sampleVisualizationDirection(() => 0)
    const last = sampleVisualizationDirection(() => 0.99)
    for (const axis of axes) {
      expect(first[axis]).not.toBe(last[axis])
    }
  })

  test("picks a new direction on every call", () => {
    expect(buildVisualizationPrompt(input)).not.toBe(buildVisualizationPrompt(input))
  })

  test("tells the model the direction outranks the example", () => {
    const prompt = buildVisualizationPrompt(input)
    expect(prompt).toContain("not the style to copy")
    expect(prompt).toContain("Follow the DIRECTION")
  })
})
