import { expect, test } from "bun:test"
import {
  buildLyricCues,
  cueIndexAt,
  LyricCue,
  lyricEnvelope,
  parseYue2VocalTimeline,
} from "./songs.lyrics.timing"

const vocalScore = [
  "X:1",
  "M:4/4",
  "L:1/8",
  "Q:1/4=60",
  'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
  'V: Ins clef=treble name="Ins Melody" snm="Inst."',
  "K:C",
  "V: Vocal",
  "z8|c8|d8|e8|",
  "V: Ins",
  "Z4|",
].join("\n")

test("finds the vocal voice and measures its singing spans", () => {
  const timeline = parseYue2VocalTimeline(vocalScore)
  expect(timeline).not.toBeNull()
  expect(timeline?.durationSeconds).toBe(16)
  expect(timeline?.spans).toEqual([{ startSeconds: 4, endSeconds: 16 }])
})

test("splits singing spans at rests longer than a breath", () => {
  const score = [
    "X:1",
    "M:4/4",
    "L:1/8",
    "Q:1/4=60",
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    "K:C",
    "V: Vocal",
    "z8|c4z2d2|e8|",
  ].join("\n")

  const timeline = parseYue2VocalTimeline(score)

  expect(timeline?.spans).toEqual([
    { startSeconds: 4, endSeconds: 6 },
    { startSeconds: 7, endSeconds: 12 },
  ])
})

test("uses the longest voice for the score duration", () => {
  const score = [
    "X:1",
    "M:4/4",
    "L:1/8",
    "Q:1/4=60",
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    "K:C",
    "V: Vocal",
    "z8|c8|",
    "V: Ins",
    "Z8|",
  ].join("\n")

  const timeline = parseYue2VocalTimeline(score)

  expect(timeline?.durationSeconds).toBe(32)
  expect(timeline?.spans).toEqual([{ startSeconds: 4, endSeconds: 8 }])
})

test("returns null when the score has no vocal voice or no notes", () => {
  const instrumental = [
    "X:1",
    "M:4/4",
    "L:1/8",
    "Q:1/4=60",
    'V: Ins clef=treble name="Ins Melody" snm="Inst."',
    "K:C",
    "V: Ins",
    "c8|",
  ].join("\n")

  expect(parseYue2VocalTimeline(instrumental)).toBeNull()
  expect(parseYue2VocalTimeline("")).toBeNull()
})

test("places lines across the measured singing spans in order", () => {
  const cues = buildLyricCues({
    lyrics: "[Verse]\nhello world\nsecond line here",
    scoreAbc: vocalScore,
    durationSeconds: 16,
  })

  expect(cues).toEqual([
    { text: "hello world", section: "Verse", startSeconds: 4, endSeconds: 8.8 },
    { text: "second line here", section: "Verse", startSeconds: 8.8, endSeconds: 16 },
  ])
})

test("scales score time onto the real audio duration", () => {
  const cues = buildLyricCues({
    lyrics: "[Verse]\nhello world\nsecond line here",
    scoreAbc: vocalScore,
    durationSeconds: 32,
  })

  expect(cues).toEqual([
    { text: "hello world", section: "Verse", startSeconds: 8, endSeconds: 17.6 },
    { text: "second line here", section: "Verse", startSeconds: 17.6, endSeconds: 32 },
  ])
})

test("distributes lines across separate singing spans", () => {
  const score = [
    "X:1",
    "M:4/4",
    "L:1/8",
    "Q:1/4=60",
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    "K:C",
    "V: Vocal",
    "z8|c8|z8|d8|",
  ].join("\n")

  const cues = buildLyricCues({
    lyrics: "first line\nsecond line",
    scoreAbc: score,
    durationSeconds: 16,
  })

  expect(cues).toEqual([
    { text: "first line", section: null, startSeconds: 4, endSeconds: 8 },
    { text: "second line", section: null, startSeconds: 12, endSeconds: 16 },
  ])
})

test("prefers the detected vocal spans over the score, without scaling", () => {
  const cues = buildLyricCues({
    lyrics: "first line\nsecond line",
    scoreAbc: vocalScore,
    vocalSpans: [
      { startSeconds: 10, endSeconds: 14 },
      { startSeconds: 20, endSeconds: 26 },
    ],
    durationSeconds: 30,
  })

  expect(cues).toEqual([
    { text: "first line", section: null, startSeconds: 10, endSeconds: 14 },
    { text: "second line", section: null, startSeconds: 20, endSeconds: 26 },
  ])
})

test("anchors the first calibrated line to the first detected phrase", () => {
  const spans = [
    { startSeconds: 10.73, endSeconds: 11.9725 },
    { startSeconds: 13.3825, endSeconds: 14.62 },
    { startSeconds: 16.38, endSeconds: 17.6225 },
    { startSeconds: 19.0325, endSeconds: 20.265 },
    { startSeconds: 22.74, endSeconds: 25.91 },
    { startSeconds: 28.39, endSeconds: 31.565 },
    { startSeconds: 34.03, endSeconds: 37.21 },
    { startSeconds: 39.68, endSeconds: 42.855 },
  ]

  const cues = buildLyricCues({
    lyrics: "[Verse]\nhold the line\ncall it home",
    scoreAbc: null,
    vocalSpans: spans,
    durationSeconds: 58.678666666666665,
  })

  expect(cues[0]).toEqual({
    text: "hold the line",
    section: "Verse",
    startSeconds: 10.73,
    endSeconds: 11.9725,
  })
})

test("keeps the anchored first phrase to one line", () => {
  const spans = [
    { startSeconds: 0, endSeconds: 3.9 },
    { startSeconds: 3.9, endSeconds: 6.9 },
    { startSeconds: 6.9, endSeconds: 9.9 },
    { startSeconds: 9.9, endSeconds: 14.9 },
  ]

  const cues = buildLyricCues({
    lyrics: "first line here\nsecond line here\nthird line here",
    scoreAbc: null,
    vocalSpans: spans,
    durationSeconds: 14.9,
  })

  expect(cues).toEqual([
    { text: "first line here", section: null, startSeconds: 0, endSeconds: 3.9 },
    { text: "second line here", section: null, startSeconds: 3.9, endSeconds: 6.9 },
    { text: "third line here", section: null, startSeconds: 9.9, endSeconds: 14.9 },
  ])
})

test("keeps one line per noted phrase and merges the pickup", () => {
  const spans = [
    { startSeconds: 33.59, endSeconds: 37.27, noteCount: 9 },
    { startSeconds: 40.95, endSeconds: 44.41, noteCount: 8 },
    { startSeconds: 48.31, endSeconds: 54.3, noteCount: 11 },
    { startSeconds: 55.67, endSeconds: 59.13, noteCount: 11 },
    { startSeconds: 62.58, endSeconds: 63.03, noteCount: 1 },
    { startSeconds: 63.73, endSeconds: 66.71, noteCount: 8 },
  ]
  const lyrics = [
    "[Verse]",
    "In the city lights, I'm lost in dreams,",
    "My heart beats fast, it's hard to see.",
    "The streets are empty, but my feet keep stepping,",
    "Into this rhythm, where reality ends.",
    "",
    "[Chorus]",
    "Oh, let me show you what I know,",
  ].join("\n")

  const cues = buildLyricCues({ lyrics, scoreAbc: null, vocalSpans: spans, durationSeconds: 197.6 })

  expect(cues).toEqual([
    {
      text: "In the city lights, I'm lost in dreams,",
      section: "Verse",
      startSeconds: 33.59,
      endSeconds: 37.27,
    },
    {
      text: "My heart beats fast, it's hard to see.",
      section: "Verse",
      startSeconds: 40.95,
      endSeconds: 44.41,
    },
    {
      text: "The streets are empty, but my feet keep stepping,",
      section: "Verse",
      startSeconds: 48.31,
      endSeconds: 54.3,
    },
    {
      text: "Into this rhythm, where reality ends.",
      section: "Verse",
      startSeconds: 55.67,
      endSeconds: 59.13,
    },
    {
      text: "Oh, let me show you what I know,",
      section: "Chorus",
      startSeconds: 62.58,
      endSeconds: 66.71,
    },
  ])
})

test("falls back to duration allocation when a span lacks a note count", () => {
  const cues = buildLyricCues({
    lyrics: "[Verse]\nfirst line here\nsecond line here",
    scoreAbc: null,
    vocalSpans: [
      { startSeconds: 0, endSeconds: 4, noteCount: 5 },
      { startSeconds: 4, endSeconds: 8 },
    ],
    durationSeconds: 8,
  })

  expect(cues).toEqual([
    { text: "first line here", section: "Verse", startSeconds: 0, endSeconds: 4 },
    { text: "second line here", section: "Verse", startSeconds: 4, endSeconds: 8 },
  ])
})

test("falls back to the score when the detected spans are empty", () => {
  const withEmpty = buildLyricCues({
    lyrics: "first line\nsecond line",
    scoreAbc: vocalScore,
    vocalSpans: [],
    durationSeconds: 16,
  })
  const withoutSpans = buildLyricCues({
    lyrics: "first line\nsecond line",
    scoreAbc: vocalScore,
    durationSeconds: 16,
  })

  expect(withEmpty).toEqual(withoutSpans)
  expect(withEmpty[0]?.startSeconds).toBe(4)
})

test("falls back to an even spread when the score is missing", () => {
  const cues = buildLyricCues({
    lyrics: "aa bb\ncc dd",
    scoreAbc: null,
    durationSeconds: 100,
  })

  expect(cues).toEqual([
    { text: "aa bb", section: null, startSeconds: 6, endSeconds: 50 },
    { text: "cc dd", section: null, startSeconds: 50, endSeconds: 94 },
  ])
})

test("strips section tags from the line and carries the active one", () => {
  const cues = buildLyricCues({
    lyrics: "[Verse]\n\n  hold on  \n[Chorus]\nlet go",
    scoreAbc: null,
    durationSeconds: 10,
  })

  expect(cues.map((cue) => [cue.text, cue.section])).toEqual([
    ["hold on", "Verse"],
    ["let go", "Chorus"],
  ])
})

test("splits run-on lyrics at section tags, slashes, and sentence ends", () => {
  const lyrics = [
    "[Verse 1] I'm just like your favorite pair of sneakers / Always there when you need me, but sometimes",
    "Feel outgrown in this fast-paced world / But then again, who needs a steady pace? [Chorus] With every step and sigh / We're walking on a worn-out trail",
  ].join("\n")

  const cues = buildLyricCues({ lyrics, scoreAbc: null, durationSeconds: 100 })

  expect(cues.map((cue) => cue.text)).toEqual([
    "I'm just like your favorite pair of sneakers",
    "Always there when you need me, but sometimes",
    "Feel outgrown in this fast-paced world",
    "But then again, who needs a steady pace?",
    "With every step and sigh",
    "We're walking on a worn-out trail",
  ])
  expect(cues.map((cue) => cue.section)).toEqual([
    "Verse 1",
    "Verse 1",
    "Verse 1",
    "Verse 1",
    "Chorus",
    "Chorus",
  ])
})

test("keeps short lines whole and only splits long comma runs", () => {
  const lyrics = [
    "short line, still one",
    "[Verse] In twilight's whisper, I find my way Home under starlit skies where shadows play With the wind as friend",
  ].join("\n")

  const cues = buildLyricCues({ lyrics, scoreAbc: null, durationSeconds: 100 })

  expect(cues.map((cue) => cue.text)).toEqual([
    "short line, still one",
    "In twilight's whisper",
    "I find my way Home under starlit skies where shadows play With the wind as friend",
  ])
  expect(cues.map((cue) => cue.section)).toEqual([null, "Verse", "Verse"])
})

test("returns no cues when there are no lyrics or no duration", () => {
  expect(buildLyricCues({ lyrics: "   \n\n", scoreAbc: null, durationSeconds: 10 })).toEqual([])
  expect(buildLyricCues({ lyrics: "hello", scoreAbc: vocalScore, durationSeconds: 0 })).toEqual([])
})

test("cueIndexAt follows playback through the cue list", () => {
  const cues: readonly LyricCue[] = [
    { text: "a", section: null, startSeconds: 4, endSeconds: 8 },
    { text: "b", section: "Chorus", startSeconds: 8, endSeconds: 12 },
  ]

  expect(cueIndexAt(cues, -1)).toBeNull()
  expect(cueIndexAt(cues, 3.99)).toBeNull()
  expect(cueIndexAt(cues, 4)).toBe(0)
  expect(cueIndexAt(cues, 9.5)).toBe(1)
  expect(cueIndexAt(cues, 99)).toBe(1)
  expect(cueIndexAt([], 5)).toBeNull()
})

test("lyricEnvelope fades in over the given fraction and out over the tail", () => {
  expect(lyricEnvelope(0, 0.4)).toBe(0)
  expect(lyricEnvelope(0.4, 0.4)).toBe(1)
  expect(lyricEnvelope(0.5, 0.4)).toBe(1)
  expect(lyricEnvelope(0.86, 0.4)).toBeCloseTo(0.5)
  expect(lyricEnvelope(1, 0.4)).toBe(0)
  expect(lyricEnvelope(1.5, 0.4)).toBe(0)
})

test("lyricEnvelope settles a long line in a fixed share of its length", () => {
  // A 10 s line fades in over the first 0.4 s: a fraction of 0.04.
  expect(lyricEnvelope(0.04, 0.04)).toBe(1)
  expect(lyricEnvelope(0.02, 0.04)).toBeCloseTo(0.5)
})
