import { describe, expect, test } from "bun:test"
import { ok } from "../shared/result"
import { songFixture } from "../songs/songs.fixtures"
import { makeGetVisualization } from "./visualizations.get.usecase"

const song = songFixture({
  id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
  style: "pop",
  lyrics: "hello",
})

const code = "(host) => ({})"

const makeUseCase = (overrides: Partial<Parameters<typeof makeGetVisualization>[0]> = {}) =>
  makeGetVisualization({
    findSongById: async () => song,
    readCode: async () => null,
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

    expect(await get(song.id)).toEqual(ok({ status: "ready", code, checksum: `sum:${code}` }))
  })

  test("a file with a run in flight reports rerolling, old code included", async () => {
    const get = makeUseCase({ readCode: async () => code, isInFlight: () => true })

    const result = await get(song.id)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe("rerolling")
    expect(result.value.code).toBe(code)
  })

  test("no file and a run in flight reports pending", async () => {
    const get = makeUseCase({ isInFlight: () => true })

    expect(await get(song.id)).toEqual(ok({ status: "pending" }))
  })

  test("no file and a failure reports failed with the detail", async () => {
    const get = makeUseCase({ failureFor: () => "503 down" })

    expect(await get(song.id)).toEqual(ok({ status: "failed", errorDetail: "503 down" }))
  })

  test("the file wins over a remembered failure", async () => {
    const get = makeUseCase({ readCode: async () => code, failureFor: () => "503 down" })

    expect(await get(song.id)).toEqual(ok({ status: "ready", code, checksum: `sum:${code}` }))
  })

  test("no file, no run, no failure is not found", async () => {
    const get = makeUseCase()

    expect(await get(song.id)).toEqual({ ok: false, error: { kind: "not_found" } })
  })
})
