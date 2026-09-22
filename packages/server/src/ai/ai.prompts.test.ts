import { describe, expect, test } from "bun:test"
import {
  buildLyricsEnhancePrompt,
  buildRandomLyricsPrompt,
  buildRandomStylePrompt,
  buildStyleEnhancePrompt,
  cleanAgentText,
  isUsableLyrics,
  isUsableStyleBrief,
  parseEnhanceText,
} from "./ai.prompts"

const words = (count: number): string =>
  Array.from({ length: count }, (_, index) => `word${index}`).join(" ")

describe("cleanAgentText", () => {
  test("strips markdown fences", () => {
    expect(cleanAgentText("```\ndream pop, hazy\n```")).toBe("dream pop, hazy")
    expect(cleanAgentText("```text\nshoegaze\n```")).toBe("shoegaze")
  })

  test("strips wrapping quotes", () => {
    expect(cleanAgentText('"post-punk"')).toBe("post-punk")
  })

  test("keeps plain text", () => {
    expect(cleanAgentText("  synthwave at 118 bpm  ")).toBe("synthwave at 118 bpm")
  })
})

describe("buildStyleEnhancePrompt", () => {
  test("embeds the style and the production dimensions", () => {
    const prompt = buildStyleEnhancePrompt({ style: "dark techno" })
    expect(prompt).toContain("dark techno")
    expect(prompt).toContain("Voice")
    expect(prompt).toContain("Instrumentation")
    expect(prompt).toContain("Harmony")
    expect(prompt).toContain("slurs are never allowed")
    expect(prompt).toContain("ONLY the brief")
    expect(prompt).toContain("under 140 words")
  })

  test("leads the dimensions with the language of the sung words", () => {
    const prompt = buildStyleEnhancePrompt({ style: "dark techno" })
    expect(prompt).toContain("- Language:")
    expect(prompt).toContain("default to English")
    expect(prompt.indexOf("- Language:")).toBeLessThan(prompt.indexOf("- Genre:"))
  })

  test("asks for a descriptor stack, not a paragraph", () => {
    const prompt = buildStyleEnhancePrompt({ style: "dark techno" })
    expect(prompt).toContain("comma-separated stack")
    expect(prompt).toContain("25 to 50 words")
    expect(prompt).toContain("No labels, no full sentences, no square brackets")
  })

  test("allows one exclusion for a dropped instrument", () => {
    const prompt = buildStyleEnhancePrompt({ style: "dark techno" })
    expect(prompt).toContain('"no <instrument>"')
  })

  test("demands plain text with no markdown or fancy punctuation", () => {
    const prompt = buildStyleEnhancePrompt({ style: "dark techno" })
    expect(prompt).toContain("no markdown of any kind")
    expect(prompt).toContain("no semicolons, no em dashes")
  })

  test("ships no palette and no nudge", () => {
    const prompt = buildStyleEnhancePrompt({ style: "dark techno" })
    expect(prompt).not.toContain("lean toward")
    expect(prompt).not.toContain("sun-drenched indie pop")
    expect(prompt).not.toContain("smoky late-night croon")
  })

  test("includes lyrics as casting context when present", () => {
    const prompt = buildStyleEnhancePrompt({
      style: "country",
      lyrics: "[Verse]\nI lost the farm",
    })
    expect(prompt).toContain("voice casting")
    expect(prompt).toContain("I lost the farm")
  })

  test("asks the lyrics for their language, not just their mood", () => {
    const prompt = buildStyleEnhancePrompt({
      style: "country",
      lyrics: "[Verse]\n月亮升起来",
    })
    expect(prompt).toContain("for voice casting, language, and mood")
    expect(prompt).toContain("月亮升起来")
  })

  test("omits lyrics context when empty", () => {
    const prompt = buildStyleEnhancePrompt({ style: "country", lyrics: "   " })
    expect(prompt).not.toContain("voice casting")
  })
})

describe("buildLyricsEnhancePrompt", () => {
  test("extend mode keeps the lyrics in the prompt", () => {
    const prompt = buildLyricsEnhancePrompt({ lyrics: "[Verse]\nhello" })
    expect(prompt).toContain("[Verse]\nhello")
    expect(prompt).toContain("Rework and extend")
    expect(prompt).toContain("slurs are never allowed")
  })

  test("never mentions a style", () => {
    const prompt = buildLyricsEnhancePrompt({ lyrics: "" })
    expect(prompt).not.toContain("style")
  })

  test("empty lyrics switch to brand-new mode", () => {
    const prompt = buildLyricsEnhancePrompt({ lyrics: "" })
    expect(prompt).toContain("brand new original song lyrics")
  })

  test("demands one line per lyric line", () => {
    const prompt = buildLyricsEnhancePrompt({ lyrics: "" })
    expect(prompt).toContain("own line")
    expect(prompt).toContain("Never pack a verse into one paragraph")
  })

  test("demands plain text, same as the style writer", () => {
    const prompt = buildLyricsEnhancePrompt({ lyrics: "[Verse]\nx" })
    expect(prompt).toContain("no markdown of any kind")
    expect(prompt).toContain("no semicolons, no em dashes")
  })

  test("brand-new mode offers a menu of song structures to pick from", () => {
    const prompt = buildLyricsEnhancePrompt({ lyrics: "" })
    expect(prompt).toContain("[Verse] → [Chorus] → [Verse] → [Chorus] → [Bridge] → [Outro]")
    expect(prompt).toContain("[Verse] → [Chorus] → [Verse] → [Chorus] → [Outro]")
    expect(prompt).toContain("[Verse] → [Verse] → [Chorus] → [Verse] → [Chorus] → [Outro]")
    expect(prompt).toContain("[Verse] → [Pre-Chorus] → [Chorus]")
    expect(prompt).toContain("Pick exactly one")
    expect(prompt).toContain("— rap and storytelling")
  })

  test("rework mode keeps an existing structure, fallback menu present", () => {
    const prompt = buildLyricsEnhancePrompt({ lyrics: "[Verse]\nexisting" })
    expect(prompt).toContain("section structure YuE2 expects")
    expect(prompt).toContain("If the LYRICS have no clear structure")
    expect(prompt).toContain("[Verse] → [Chorus] → [Verse] → [Chorus] → [Bridge] → [Outro]")
  })
})

describe("buildRandomStylePrompt", () => {
  test("ships the full palette as examples, not a menu", () => {
    const prompt = buildRandomStylePrompt()
    expect(prompt).toContain("sun-drenched indie pop")
    expect(prompt).toContain("smoky late-night croon")
    expect(prompt).toContain("1974 analog")
    expect(prompt).toContain("radio-clean throughout")
    expect(prompt).toContain("not a menu")
    expect(prompt).toContain("Invent beyond")
    expect(prompt).toContain("under 140 words")
  })

  test("writes the stack, not a vivid paragraph", () => {
    const prompt = buildRandomStylePrompt()
    expect(prompt).toContain("comma-separated stack")
    expect(prompt).toContain("25 to 50 words")
  })

  test("demands plain text with no markdown or fancy punctuation", () => {
    const prompt = buildRandomStylePrompt()
    expect(prompt).toContain("no markdown of any kind")
    expect(prompt).toContain("no semicolons, no em dashes")
  })

  test("pins the language to the English lyrics it pairs with", () => {
    expect(buildRandomStylePrompt()).toContain("The lyrics are English")
  })

  test("leaves the chords to the planner", () => {
    expect(buildRandomStylePrompt()).toContain("the planner writes the chords")
  })

  test("shuffles the palette on every call", () => {
    expect(buildRandomStylePrompt()).not.toBe(buildRandomStylePrompt())
  })
})

describe("buildRandomLyricsPrompt", () => {
  test("carries the lyric rules and no style", () => {
    const prompt = buildRandomLyricsPrompt()
    expect(prompt).toContain("[Verse]")
    expect(prompt).toContain("own line")
    expect(prompt).toContain("150 to 400 words")
    expect(prompt).toContain("slurs are never allowed")
    expect(prompt).toContain("ONLY the lyric sheet")
    expect(prompt).not.toContain("style")
  })

  test("demands plain text too", () => {
    const prompt = buildRandomLyricsPrompt()
    expect(prompt).toContain("no markdown of any kind")
    expect(prompt).toContain("no semicolons, no em dashes")
  })

  test("writes in English so the style and lyrics agree", () => {
    expect(buildRandomLyricsPrompt()).toContain("in English")
  })
})

describe("isUsableStyleBrief", () => {
  test("rejects empty briefs", () => {
    expect(isUsableStyleBrief("")).toBe(false)
    expect(isUsableStyleBrief("   ")).toBe(false)
  })

  test("rejects briefs over the word limit", () => {
    expect(isUsableStyleBrief(words(141))).toBe(false)
  })

  test("accepts a brief at the word limit", () => {
    expect(isUsableStyleBrief(words(140))).toBe(true)
  })
})

describe("isUsableLyrics", () => {
  test("requires a section tag", () => {
    expect(isUsableLyrics(words(200))).toBe(false)
    expect(isUsableLyrics(`[Verse]\n${words(200)}`)).toBe(true)
  })

  test("holds the sheet to 150 to 400 sung words", () => {
    expect(isUsableLyrics(`[Verse]\n${words(149)}`)).toBe(false)
    expect(isUsableLyrics(`[Verse]\n${words(150)}`)).toBe(true)
    expect(isUsableLyrics(`[Verse]\n${words(400)}`)).toBe(true)
    expect(isUsableLyrics(`[Verse]\n${words(401)}`)).toBe(false)
  })

  test("does not count section tags as words", () => {
    expect(isUsableLyrics("[Verse]\n[Chorus]\n[Outro]")).toBe(false)
    expect(isUsableLyrics(`[Verse]\n[Chorus]\n${words(150)}`)).toBe(true)
  })
})

describe("parseEnhanceText", () => {
  test("returns cleaned text", () => {
    expect(parseEnhanceText("```\nfunk 1977\n```")).toBe("funk 1977")
  })

  test("null on empty replies", () => {
    expect(parseEnhanceText("   ")).toBeNull()
  })
})
