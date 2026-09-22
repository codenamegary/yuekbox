import { describe, expect, test } from "bun:test"
import { SongAnalysis } from "contracts/http/visualizations"
import { ok } from "../shared/result"
import { songFixture } from "../songs/songs.fixtures"
import { makeGetVisualization } from "./visualizations.get.usecase"

const song = songFixture({
  id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
  style: "pop",
  lyrics: "hello",
})

const code = "(host) => ({})"

const analysis: SongAnalysis = {
  version: 1,
  source: "sheetsage2",
  notes: [{ startSeconds: 1, endSeconds: 1.5, pitch: 64 }],
  beats: [{ time: 0, position: 1, beatsPerBar: 4, beatUnit: 4 }],
  sections: [{ name: "intro", startSeconds: 0, endSeconds: 8 }],
}

const makeUseCase = (overrides: Partial<Parameters<typeof makeGetVisualization>[0]> = {}) =>
  makeGetVisualization({
    findSongById: async () => song,
    readCode: async () => null,
    readAnalysis: async () => null,
    isInFlight: () => false,
    failureFor: () => null,
    checksum: (value) => `sum:${value}`,
    ...overrides,
  })

describe("makeGetVisualization", () => {
  test("an unknown Song is not found", async () => {
    const get = makeUseCase({ findSongById: async () => null })

    expect(await get(song.id)).toEqual({ ok: false, error: { kind: "not_found" } })
  })

  test("a file that is idle reports ready with its code and checksum", async () => {
    const get = makeUseCase({ readCode: async () => code })

    expect(await get(song.id)).toEqual(
      ok({
        visualization: { status: "ready", code, checksum: `sum:${code}` },
        analysis: null,
      }),
    )
  })

  test("a file with a run in flight reports rerolling, old code included", async () => {
    const get = makeUseCase({ readCode: async () => code, isInFlight: () => true })

    const result = await get(song.id)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.visualization?.status).toBe("rerolling")
    expect(result.value.visualization?.code).toBe(code)
  })

  test("no file and a run in flight reports pending", async () => {
    const get = makeUseCase({ isInFlight: () => true })

    expect(await get(song.id)).toEqual(ok({ visualization: { status: "pending" }, analysis: null }))
  })

  test("no file and a failure reports failed with the detail", async () => {
    const get = makeUseCase({ failureFor: () => "503 down" })

    expect(await get(song.id)).toEqual(
      ok({
        visualization: { status: "failed", errorDetail: "503 down" },
        analysis: null,
      }),
    )
  })

  test("the file wins over a remembered failure", async () => {
    const get = makeUseCase({ readCode: async () => code, failureFor: () => "503 down" })

    const result = await get(song.id)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.visualization?.status).toBe("ready")
  })

  test("no file, no run, and no failure is a null visual, not a 404", async () => {
    const get = makeUseCase()

    expect(await get(song.id)).toEqual(ok({ visualization: null, analysis: null }))
  })

  test("a Song with no visual still carries its analysis", async () => {
    const get = makeUseCase({ readAnalysis: async () => analysis })

    expect(await get(song.id)).toEqual(ok({ visualization: null, analysis }))
  })

  test("a Song with a visual carries both", async () => {
    const get = makeUseCase({ readCode: async () => code, readAnalysis: async () => analysis })

    const result = await get(song.id)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.visualization?.code).toBe(code)
    expect(result.value.analysis?.sections).toHaveLength(1)
  })
})
