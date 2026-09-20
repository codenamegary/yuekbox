import { describe, expect, test } from "bun:test"
import { SongVisualizationSchema, songVisualizationPath } from "./visualizations"

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
