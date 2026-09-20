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

test("lyricEnvelope fades in and out across a cue", () => {
  expect(lyricEnvelope(0)).toBe(0)
  expect(lyricEnvelope(0.16)).toBe(1)
  expect(lyricEnvelope(0.5)).toBe(1)
  expect(lyricEnvelope(0.86)).toBeCloseTo(0.5)
  expect(lyricEnvelope(1)).toBe(0)
  expect(lyricEnvelope(1.5)).toBe(0)
})
