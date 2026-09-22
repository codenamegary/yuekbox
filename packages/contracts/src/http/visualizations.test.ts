import { describe, expect, test } from "bun:test"
import {
  AnalysisBeatSchema,
  AnalysisNoteSchema,
  SongAnalysisSchema,
  SongVisualizationResponseSchema,
  SongVisualizationSchema,
  songVisualizationPath,
} from "./visualizations"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

describe("songVisualizationPath", () => {
  test("points at the Song's visualization route", () => {
    expect(songVisualizationPath(songId)).toBe(`/v1/songs/${songId}/visualization`)
  })
})

describe("SongVisualizationSchema", () => {
  test("ready carries the code and its checksum", () => {
    const parsed = SongVisualizationSchema.parse({
      status: "ready",
      code: "(host) => ({})",
      checksum: "a1b2c3",
    })
    expect(parsed.status).toBe("ready")
    expect(parsed.code).toBe("(host) => ({})")
  })

  test("rerolling carries the visual that is still playing", () => {
    const parsed = SongVisualizationSchema.parse({
      status: "rerolling",
      code: "(host) => ({})",
      checksum: "a1b2c3",
    })
    expect(parsed.status).toBe("rerolling")
  })

  test("ready and rerolling require both code and checksum", () => {
    expect(SongVisualizationSchema.safeParse({ status: "ready", code: "x" }).success).toBe(false)
    expect(SongVisualizationSchema.safeParse({ status: "ready", checksum: "x" }).success).toBe(
      false,
    )
    expect(SongVisualizationSchema.safeParse({ status: "rerolling", code: "x" }).success).toBe(
      false,
    )
  })

  test("failed requires an error detail", () => {
    expect(SongVisualizationSchema.safeParse({ status: "failed" }).success).toBe(false)
    expect(
      SongVisualizationSchema.safeParse({ status: "failed", errorDetail: "nope" }).success,
    ).toBe(true)
  })

  test("pending carries no code, checksum, or error", () => {
    expect(SongVisualizationSchema.parse({ status: "pending" }).status).toBe("pending")
    expect(
      SongVisualizationSchema.safeParse({ status: "pending", code: "x", checksum: "y" }).success,
    ).toBe(false)
    expect(SongVisualizationSchema.safeParse({ status: "pending", errorDetail: "x" }).success).toBe(
      false,
    )
  })

  test("code and errorDetail never travel together", () => {
    expect(
      SongVisualizationSchema.safeParse({
        status: "ready",
        code: "x",
        checksum: "y",
        errorDetail: "z",
      }).success,
    ).toBe(false)
  })

  test("rejects unknown statuses and stray keys", () => {
    expect(SongVisualizationSchema.safeParse({ status: "authoring" }).success).toBe(false)
    expect(
      SongVisualizationSchema.safeParse({ status: "pending", updatedAt: "2026-09-20T00:00:00Z" })
        .success,
    ).toBe(false)
  })
})

const analysis = {
  version: 1,
  source: "sheetsage2",
  notes: [
    { startSeconds: 1, endSeconds: 1.5, pitch: 64 },
    { startSeconds: 2, endSeconds: 2.75, pitch: 67 },
  ],
  beats: [
    { time: 0, position: 1, beatsPerBar: 4, beatUnit: 4 },
    { time: 0.5, position: 2, beatsPerBar: 4, beatUnit: 4 },
  ],
  sections: [
    { name: "intro", startSeconds: 0, endSeconds: 8 },
    { name: "verse", startSeconds: 8, endSeconds: 40 },
  ],
}

describe("SongAnalysisSchema", () => {
  test("parses notes, beats, and sections", () => {
    const parsed = SongAnalysisSchema.parse(analysis)
    expect(parsed.notes).toHaveLength(2)
    expect(parsed.beats[0]?.position).toBe(1)
    expect(parsed.sections[1]?.name).toBe("verse")
  })

  test("empty arrays are legal", () => {
    const parsed = SongAnalysisSchema.parse({
      version: 1,
      source: "sheetsage2",
      notes: [],
      beats: [],
      sections: [],
    })
    expect(parsed.notes).toEqual([])
  })

  test("rejects a note that ends before it starts", () => {
    expect(
      AnalysisNoteSchema.safeParse({ startSeconds: 2, endSeconds: 2, pitch: 60 }).success,
    ).toBe(false)
  })

  test("rejects a beat position outside its bar", () => {
    expect(
      AnalysisBeatSchema.safeParse({ time: 0, position: 5, beatsPerBar: 4, beatUnit: 4 }).success,
    ).toBe(false)
  })

  test("rejects an unknown source and stray keys", () => {
    expect(SongAnalysisSchema.safeParse({ ...analysis, source: "whisper" }).success).toBe(false)
    expect(SongAnalysisSchema.safeParse({ ...analysis, bpm: 120 }).success).toBe(false)
  })
})

describe("SongVisualizationResponseSchema", () => {
  test("parses a Song with neither a visual nor an analysis", () => {
    expect(SongVisualizationResponseSchema.parse({ visualization: null, analysis: null })).toEqual({
      visualization: null,
      analysis: null,
    })
  })

  test("carries analysis while no visual exists", () => {
    const parsed = SongVisualizationResponseSchema.parse({
      visualization: null,
      analysis,
    })
    expect(parsed.analysis?.sections).toHaveLength(2)
    expect(parsed.visualization).toBeNull()
  })

  test("carries a visual while no analysis exists", () => {
    const parsed = SongVisualizationResponseSchema.parse({
      visualization: { status: "ready", code: "(host) => ({})", checksum: "a1b2c3" },
      analysis: null,
    })
    expect(parsed.visualization?.status).toBe("ready")
    expect(parsed.analysis).toBeNull()
  })

  test("requires both keys", () => {
    expect(SongVisualizationResponseSchema.safeParse({ analysis: null }).success).toBe(false)
    expect(SongVisualizationResponseSchema.safeParse({ visualization: null }).success).toBe(false)
  })
})
