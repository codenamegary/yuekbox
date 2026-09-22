import { expect, test } from "bun:test"
import { Calibration } from "contracts/http/songs"
import { songFixture } from "./songs.fixtures"
import { makeGetSong } from "./songs.get.usecase"

const song = songFixture()

test("get returns the song when it exists", async () => {
  const getSong = makeGetSong({
    findSongById: async () => song,
    readScoreAbc: async () => null,
    readCalibration: async () => null,
    findReferenceSummary: async () => null,
  })

  const result = await getSong(song.id)

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value).toEqual(song)
})

test("get fills the score and the reference summary from disk", async () => {
  const getSong = makeGetSong({
    findSongById: async () => song,
    readScoreAbc: async () => "X:1\nK:C\nC D E|",
    readCalibration: async () => null,
    findReferenceSummary: async () => ({ id: "01J8K3R4P9ABCDEFGHJKMNPQRT", filename: "demo.mp3" }),
  })

  const result = await getSong(song.id)

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.scoreAbc).toBe("X:1\nK:C\nC D E|")
  expect(result.value.reference).toEqual({
    id: "01J8K3R4P9ABCDEFGHJKMNPQRT",
    filename: "demo.mp3",
  })
})

test("get fills the calibration from disk", async () => {
  const calibration: Calibration = {
    cues: [{ text: "hello world", startSeconds: 12.3, endSeconds: 16.8 }],
  }
  const getSong = makeGetSong({
    findSongById: async () => song,
    readScoreAbc: async () => null,
    readCalibration: async () => calibration,
    findReferenceSummary: async () => null,
  })

  const result = await getSong(song.id)

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.calibration).toEqual(calibration)
})

test("get missing id is not-found", async () => {
  const getSong = makeGetSong({
    findSongById: async () => null,
    readScoreAbc: async () => null,
    readCalibration: async () => null,
    findReferenceSummary: async () => null,
  })

  const result = await getSong("01J8K3R4P9ABCDEFGHJKMNPQRT")

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.kind).toBe("not_found")
})
