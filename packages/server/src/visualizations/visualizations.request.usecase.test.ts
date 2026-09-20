import { describe, expect, test } from "bun:test"
import { err, ok } from "../shared/result"
import { songFixture } from "../songs/songs.fixtures"
import { Song } from "../songs/songs.models"
import { makeRequestVisualization } from "./visualizations.request.usecase"

const song = songFixture({
  id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
  style: "pop",
  lyrics: "hello",
})

const makeUseCase = (options: {
  findSongById?: (songId: string) => Promise<Song | null>
  canAuthor?: Parameters<typeof makeRequestVisualization>[0]["canAuthor"]
  started?: Song[]
}) =>
  makeRequestVisualization({
    findSongById: options.findSongById ?? (async () => song),
    canAuthor: options.canAuthor ?? (async () => ok(null)),
    start: (started) => {
      options.started?.push(started)
    },
  })

describe("makeRequestVisualization", () => {
  test("an unknown Song is not found and nothing starts", async () => {
    const started: Song[] = []
    const request = makeUseCase({ findSongById: async () => null, started })

    expect(await request(song.id)).toEqual(err({ kind: "not_found" }))
    expect(started).toEqual([])
  })

  test("a disabled visuals writer refuses with its detail", async () => {
    const started: Song[] = []
    const request = makeUseCase({
      canAuthor: async () =>
        err({ kind: "ai_disabled", detail: "AI is disabled. Enable it in settings first." }),
      started,
    })

    const result = await request(song.id)

    expect(result).toEqual(
      err({ kind: "ai_disabled", detail: "AI is disabled. Enable it in settings first." }),
    )
    expect(started).toEqual([])
  })

  test("an unconfigured visuals writer refuses with its detail", async () => {
    const started: Song[] = []
    const request = makeUseCase({
      canAuthor: async () => err({ kind: "not_configured", detail: "Pick a model." }),
      started,
    })

    const result = await request(song.id)

    expect(result).toEqual(err({ kind: "not_configured", detail: "Pick a model." }))
    expect(started).toEqual([])
  })

  test("a ready writer starts authoring for the whole Song", async () => {
    const started: Song[] = []
    const request = makeUseCase({ started })

    expect(await request(song.id)).toEqual(ok(null))
    expect(started).toEqual([song])
  })
})
