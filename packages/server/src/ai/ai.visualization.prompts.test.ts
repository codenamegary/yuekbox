import { describe, expect, test } from "bun:test"
import {
  buildVisualizationPrompt,
  sampleVisualizerDirection,
  sampleVisualizerPalette,
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

  test("asks for visual interest, variety, and delight", () => {
    const flat = buildVisualizationPrompt(input).replace(/\s+/g, " ")
    expect(flat).toContain("Visual Interest")
    expect(flat).toContain("the scene should evolve as the song progresses")
    expect(flat).toContain("Surprise and delight")
  })

  test("keeps the kaleidoscope motif out of the brief", () => {
    expect(buildVisualizationPrompt(input).toLowerCase()).not.toContain("kaleidoscope")
  })

  test("asks for the visual to respond to the music", () => {
    const flat = buildVisualizationPrompt(input).replace(/\s+/g, " ")
    expect(flat).toContain("Respond to the music")
    expect(flat).toContain("react to bins so the picture moves with the music")
    expect(flat).toContain("Keep motion continuous and smooth")
  })

  test("guards against constant shaking", () => {
    const flat = buildVisualizationPrompt(input).replace(/\s+/g, " ")
    expect(flat).toContain("Motion is smooth by default")
    expect(flat).toContain("never as a constant tremor")
    expect(flat).toContain("Use jitters and glitches for effect")
  })

  test("samples a descriptive palette into the brief", () => {
    const palette = sampleVisualizerPalette(() => 0)
    const flat = buildVisualizationPrompt(input, () => 0).replace(/\s+/g, " ")
    expect(flat).toContain(`- palette: ${palette}`)
    expect(flat).toContain("you are free to augment and change and improvise")
    expect(palette).not.toContain("#")
  })

  test("samples a different palette for different randoms", () => {
    expect(sampleVisualizerPalette(() => 0)).not.toBe(sampleVisualizerPalette(() => 0.99))
  })

  test("samples a direction of motion and tells the model to follow it", () => {
    const direction = sampleVisualizerDirection(() => 0)
    const flat = buildVisualizationPrompt(input, () => 0).replace(/\s+/g, " ")
    expect(flat).toContain("DIRECTION")
    expect(flat).toContain(`- motion: ${direction}`)
  })

  test("samples a different direction for different randoms", () => {
    expect(sampleVisualizerDirection(() => 0)).not.toBe(sampleVisualizerDirection(() => 0.99))
  })

  test("keeps the lyric cues in the brief", () => {
    const flat = buildVisualizationPrompt(input).replace(/\s+/g, " ")
    expect(flat).toContain("Lyrics live in host.cues")
  })

  test("states the host contract the code must satisfy", () => {
    const prompt = buildVisualizationPrompt(input)
    for (const member of ["resize", "renderAudioFrame", "dispose"]) {
      expect(prompt).toContain(member)
    }
    expect(prompt).toContain("host.canvas")
    expect(prompt).toContain("host.song")
    expect(prompt).toContain("host.cues")
    expect(prompt).not.toContain("renderLyricFrame")
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
    expect(prompt).toContain("startSeconds")
    expect(prompt).toContain("endSeconds")
  })

  test("carries the required function template", () => {
    const flat = buildVisualizationPrompt(input).replace(/\s+/g, " ")
    expect(flat).toContain("TEMPLATE")
    expect(flat).toContain("resize(size)")
    expect(flat).toContain("renderAudioFrame(frame)")
  })

  test("demands the bare expression and warns off invented helpers", () => {
    const flat = buildVisualizationPrompt(input).replace(/\s+/g, " ")
    expect(flat).toContain("Return the bare expression itself: never assign it to a variable")
    expect(flat).toContain("Math.seedrandom")
  })

  test("keeps the measured score out of the prompt", () => {
    const prompt = buildVisualizationPrompt(input)
    expect(prompt).not.toContain("analysis")
    expect(prompt).not.toContain("MEASURED SCORE")
  })
})
