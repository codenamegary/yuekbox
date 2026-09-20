import { describe, expect, test } from "bun:test"
import {
  buildVisualizationPrompt,
  sampleVisualizationDirection,
  visualizationExample,
} from "./ai.visualization.prompts"

const input = {
  style: "glacial techno, 128 bpm, analog drone",
  lyrics: "[Verse]\ncold lights on the water\n[Chorus]\nI am still here",
}

describe("buildVisualizationPrompt", () => {
  test("embeds the Song's style and lyrics as creative direction", () => {
    const prompt = buildVisualizationPrompt(input)
    expect(prompt).toContain("glacial techno, 128 bpm, analog drone")
    expect(prompt).toContain("cold lights on the water")
  })

  test("states the host contract the code must satisfy", () => {
    const prompt = buildVisualizationPrompt(input)
    for (const member of ["resize", "renderAudioFrame", "renderLyricFrame", "dispose"]) {
      expect(prompt).toContain(member)
    }
    expect(prompt).toContain("host.canvas")
    expect(prompt).toContain("host.song")
  })

  test("asks for one bare function expression", () => {
    const prompt = buildVisualizationPrompt(input)
    expect(prompt).toContain("one function expression")
    expect(prompt).toContain("no imports")
    expect(prompt).toContain("no markdown")
  })

  test("spells out the frame data and the lyric cue shape", () => {
    const prompt = buildVisualizationPrompt(input)
    expect(prompt).toContain("bins")
    expect(prompt).toContain("cue")
    expect(prompt).toContain("null")
  })

  test("demands the bare expression and warns off invented helpers", () => {
    const flat = buildVisualizationPrompt(input).replace(/\s+/g, " ")
    expect(flat).toContain("Return the bare expression itself: never assign it to a variable")
    expect(flat).toContain("Math.seedrandom")
  })

  test("carries a worked dancing-line example with lyrics", () => {
    const prompt = buildVisualizationPrompt(input)
    expect(prompt).toContain(visualizationExample)
    expect(visualizationExample).toContain("(host) =>")
    for (const member of ["resize", "renderAudioFrame", "renderLyricFrame", "dispose"]) {
      expect(visualizationExample).toContain(member)
    }
    expect(visualizationExample).toContain("cue.line")
    expect(visualizationExample).toContain("hsla")
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
