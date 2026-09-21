import { expect, test } from "bun:test"
import { Song } from "contracts/http/songs"
import { countWords, draftIsEmpty, draftMatchesSong, shouldConfirmLoad } from "./songs.draft"

const song: Song = Object.freeze({
  id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
  status: "complete",
  lyrics: "neon fades",
  style: "warm piano pop",
  title: "neon fades",
  seed: 1,
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
  expect(draftIsEmpty({ style: "", lyrics: "  " })).toBe(true)
  expect(shouldConfirmLoad({ style: "", lyrics: "" }, song)).toBe(false)
})

test("a draft that matches the song loads without confirmation", () => {
  const draft = { style: "warm piano pop", lyrics: "neon fades" }
  expect(draftMatchesSong(draft, song)).toBe(true)
  expect(shouldConfirmLoad(draft, song)).toBe(false)
  expect(shouldConfirmLoad({ style: "  warm piano pop ", lyrics: "neon fades" }, song)).toBe(false)
})

test("a different non-empty draft asks for confirmation", () => {
  expect(shouldConfirmLoad({ style: "synthwave", lyrics: "" }, song)).toBe(true)
  expect(shouldConfirmLoad({ style: "", lyrics: "something else" }, song)).toBe(true)
})
