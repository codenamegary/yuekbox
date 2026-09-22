import { describe, expect, test } from "bun:test"
import { SongAnalysis } from "contracts/http/visualizations"
import { downbeatAt, downbeatTimes } from "./songs.winamp.engine"

const analysis: SongAnalysis = {
  version: 1,
  source: "sheetsage2",
  notes: [],
  beats: [
    { time: 4, position: 1, beatsPerBar: 4, beatUnit: 4 },
    { time: 4.5, position: 2, beatsPerBar: 4, beatUnit: 4 },
    { time: 5, position: 1, beatsPerBar: 4, beatUnit: 4 },
    { time: 0.5, position: 2, beatsPerBar: 4, beatUnit: 4 },
    { time: 0, position: 1, beatsPerBar: 4, beatUnit: 4 },
  ],
  sections: [],
}

describe("downbeatTimes", () => {
  test("keeps only position 1 beats, earliest first", () => {
    expect(downbeatTimes(analysis)).toEqual([0, 4, 5])
  })

  test("a Song with no analysis has no downbeats", () => {
    expect(downbeatTimes(null)).toEqual([])
  })
})

describe("downbeatAt", () => {
  test("returns the latest downbeat at or before the time", () => {
    expect(downbeatAt([0, 4, 5], 0)).toBe(0)
    expect(downbeatAt([0, 4, 5], 4.2)).toBe(4)
    expect(downbeatAt([0, 4, 5], 5)).toBe(5)
    expect(downbeatAt([0, 4, 5], 9)).toBe(5)
  })

  test("returns null before the first downbeat", () => {
    expect(downbeatAt([1, 2], 0.5)).toBeNull()
    expect(downbeatAt([], 3)).toBeNull()
  })
})
