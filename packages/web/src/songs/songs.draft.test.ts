import { expect, test } from "bun:test"
import { Song } from "contracts/http/songs"
import {
  applyEnhanceToDraft,
  countWords,
  draftIsEmpty,
  draftMatchesSong,
  shouldConfirmLoad,
} from "./songs.draft"

const song: Song = Object.freeze({
  id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
  status: "complete",
  lyrics: "neon fades",
  style: "warm piano pop",
  title: "neon fades",
  seed: 1,
  cfgScale: 1,
  durationSeconds: 12,
  truncated: { abc: false, semantic: false },
  createdAt: "2026-09-17T04:00:00.000Z",
  updatedAt: "2026-09-17T04:00:00.000Z",
  completedAt: "2026-09-17T04:00:00.000Z",
})

test("countWords ignores extra whitespace", () => {
  expect(countWords("")).toBe(0)
  expect(countWords("   ")).toBe(0)
  expect(countWords(" one  two\nthree ")).toBe(3)
})

test("an empty draft never needs confirmation", () => {
  expect(draftIsEmpty({ style: "", lyrics: "  ", cfgScale: 1 })).toBe(true)
  expect(shouldConfirmLoad({ style: "", lyrics: "", cfgScale: 1 }, song)).toBe(false)
})

test("a draft that matches the song loads without confirmation", () => {
  const draft = { style: "warm piano pop", lyrics: "neon fades", cfgScale: 1 }
  expect(draftMatchesSong(draft, song)).toBe(true)
  expect(shouldConfirmLoad(draft, song)).toBe(false)
  expect(
    shouldConfirmLoad({ style: "  warm piano pop ", lyrics: "neon fades", cfgScale: 1 }, song),
  ).toBe(false)
})

test("an enhance result only rewrites the field it was asked for", () => {
  const draft = { style: "warm piano", lyrics: "neon fades", cfgScale: 1.4 }
  expect(applyEnhanceToDraft(draft, "style", "cold synth")).toEqual({
    style: "cold synth",
    lyrics: "neon fades",
    cfgScale: 1.4,
  })
  expect(applyEnhanceToDraft(draft, "lyrics", "city lights")).toEqual({
    style: "warm piano",
    lyrics: "city lights",
    cfgScale: 1.4,
  })
})

test("a different non-empty draft asks for confirmation", () => {
  expect(shouldConfirmLoad({ style: "synthwave", lyrics: "", cfgScale: 1 }, song)).toBe(true)
  expect(shouldConfirmLoad({ style: "", lyrics: "something else", cfgScale: 1 }, song)).toBe(true)
})

test("a different cfg scale alone does not ask for confirmation", () => {
  expect(
    shouldConfirmLoad({ style: "warm piano pop", lyrics: "neon fades", cfgScale: 1.4 }, song),
  ).toBe(false)
})
