import { describe, expect, test } from "bun:test"
import {
  buildLyricsEnhancePrompt,
  buildRandomSongPrompt,
  buildStyleEnhancePrompt,
  cleanAgentText,
  parseEnhanceText,
  parseRandomSong,
  pickStyleNudge,
} from "./ai.prompts"

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

describe("pickStyleNudge", () => {
  test("is deterministic for a given random source", () => {
    const nudge = pickStyleNudge(() => 0.42)
    expect(nudge).toEqual(pickStyleNudge(() => 0.42))
    expect(nudge.voice.length).toBeGreaterThan(0)
    expect(nudge.genre.length).toBeGreaterThan(0)
    expect(nudge.production.length).toBeGreaterThan(0)
    expect(nudge.register.length).toBeGreaterThan(0)
  })

  test("varies with different random values", () => {
    const first = pickStyleNudge(() => 0)
    const last = pickStyleNudge(() => 0.999)
    expect(first.voice).not.toBe(last.voice)
    expect(first.register).not.toBe(last.register)
  })
})

describe("buildStyleEnhancePrompt", () => {
  const nudge = {
    genre: "a two-genre mashup",
    voice: "male baritone",
    production: "tape wobble",
    register: "street slang, regional dialect",
  }

  test("embeds the style, the production dimensions, the nudge, and the register", () => {
    const prompt = buildStyleEnhancePrompt({ style: "dark techno", nudge })
    expect(prompt).toContain("dark techno")
    expect(prompt).toContain("Voice")
    expect(prompt).toContain("Harmony")
    expect(prompt).toContain("mashup")
    expect(prompt).toContain("male baritone")
    expect(prompt).toContain("street slang")
    expect(prompt).toContain("slurs are never allowed")
    expect(prompt).toContain("ONLY the brief")
  })

  test("includes lyrics as casting context when present", () => {
    const prompt = buildStyleEnhancePrompt({
      style: "country",
      lyrics: "[Verse]\nI lost the farm",
      nudge,
    })
    expect(prompt).toContain("voice casting")
    expect(prompt).toContain("I lost the farm")
  })

  test("omits lyrics context when empty", () => {
    const prompt = buildStyleEnhancePrompt({ style: "country", lyrics: "   ", nudge })
    expect(prompt).not.toContain("voice casting")
  })
})

describe("buildLyricsEnhancePrompt", () => {
  test("extend mode keeps the lyrics in the prompt", () => {
    const prompt = buildLyricsEnhancePrompt({
      style: "gospel",
      lyrics: "[Verse]\nhello",
    })
    expect(prompt).toContain("gospel")
    expect(prompt).toContain("[Verse]\nhello")
    expect(prompt).toContain("Rework and extend")
    expect(prompt).toContain("slurs are never allowed")
  })

  test("empty lyrics switch to brand-new mode", () => {
    const prompt = buildLyricsEnhancePrompt({ style: "", lyrics: "" })
    expect(prompt).toContain("brand new original song lyrics")
  })

  test("demands one line per lyric line", () => {
    const prompt = buildLyricsEnhancePrompt({ style: "gospel", lyrics: "" })
    expect(prompt).toContain("own line")
    expect(prompt).toContain("Never pack a verse into one paragraph")
  })
})

describe("buildRandomSongPrompt", () => {
  test("demands marker sections, singer variety, and register", () => {
    const prompt = buildRandomSongPrompt({
      nudge: {
        genre: "one lane",
        voice: "female mezzo",
        production: "dry brass",
        register: "explicit when the song earns it",
      },
    })
    expect(prompt).toContain("STYLE:")
    expect(prompt).toContain("LYRICS:")
    expect(prompt).toContain("singer profile")
    expect(prompt).toContain("female mezzo")
    expect(prompt).toContain("never default to the")
    expect(prompt).toContain("explicit when the song earns it")
    expect(prompt).toContain("slurs are never allowed")
  })

  test("demands one line per lyric line", () => {
    const prompt = buildRandomSongPrompt({
      nudge: {
        genre: "one lane",
        voice: "female mezzo",
        production: "dry brass",
        register: "conversational",
      },
    })
    expect(prompt).toContain("own line")
    expect(prompt).toContain("Never pack a verse into one paragraph")
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

describe("parseRandomSong", () => {
  test("parses a clean JSON reply", () => {
    const draft = parseRandomSong(
      '{"style":"afrobeat","lyrics":"[Verse]\\nsun up\\n[Chorus]\\ngo"}',
    )
    expect(draft).toEqual({ style: "afrobeat", lyrics: "[Verse]\nsun up\n[Chorus]\ngo" })
  })

  test("parses JSON buried in chatter", () => {
    const draft = parseRandomSong(
      'Here you go!\n```json\n{"style":"drill","lyrics":"[Chorus]\\nup"}\n```\nEnjoy.',
    )
    expect(draft?.style).toBe("drill")
  })

  test("falls back to STYLE/LYRICS markers", () => {
    const draft = parseRandomSong("STYLE: coldwave\nLYRICS: [Verse]\ngray skies")
    expect(draft?.style).toBe("coldwave")
    expect(draft?.lyrics).toContain("gray skies")
  })

  test("null when nothing parses", () => {
    expect(parseRandomSong("no structure at all")).toBeNull()
  })
})
