import { describe, expect, test } from "bun:test"
import { buildVisualizationPrompt, visualizationExample } from "./ai.visualization.prompts"

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
})
