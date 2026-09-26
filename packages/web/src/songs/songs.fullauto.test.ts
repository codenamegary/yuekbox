import { describe, expect, test } from "bun:test"
import { Song } from "contracts/http/songs"
import { createFullAutoController } from "./songs.fullauto"

const song = (id: string, status: Song["status"]): Song => {
  const base = {
    id,
    status,
    lyrics: "la la la",
    style: "warm piano pop",
    title: "la la la",
    seed: 1,
    createdAt: "2026-09-17T04:00:00.000Z",
    updatedAt: "2026-09-17T04:00:00.000Z",
  }
  if (status === "complete") {
    return {
      ...base,
      durationSeconds: 12,
      truncated: { abc: false, semantic: false },
      completedAt: "2026-09-17T04:00:00.000Z",
    }
  }
  if (status === "running") return { ...base, stage: "plan" }
  if (status === "failed") {
    return { ...base, errorDetail: "boom", completedAt: "2026-09-17T04:00:00.000Z" }
  }
  return base
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const createHarness = () => {
  const watches: string[] = []
  const plays: string[] = []
  const ended: string[] = []
  const requested: string[] = []
  const controller = createFullAutoController()
  controller.configure({
    onWatch: (songId) => {
      watches.push(songId)
    },
    onPlay: (songId) => {
      plays.push(songId)
    },
    onTrackEnded: () => {
      ended.push("ended")
    },
    requestRandom: async () => {
      const songId = `song-${requested.length + 1}`
      requested.push(songId)
      return songId
    },
  })
  return { controller, watches, plays, ended, requested: () => requested.length }
}

describe("createFullAutoController", () => {
  test("enable generates a song and plays it when generation completes", async () => {
    const { controller, watches, plays } = createHarness()
    controller.setEnabled(true)
    await flush()
    expect(watches).toEqual(["song-1"])
    controller.syncSongs([song("song-1", "complete")])
    expect(plays).toEqual(["song-1"])
  })

  test("playback start asks for the next song", async () => {
    const { controller, requested, watches } = createHarness()
    controller.setEnabled(true)
    await flush()
    controller.syncSongs([song("song-1", "complete")])
    controller.notePlayback(true, false, "song-1")
    await flush()
    expect(requested()).toBe(2)
    expect(watches).toEqual(["song-1"])
  })

  test("a new song starting after an interrupted predecessor counts as a start", async () => {
    const { controller, plays, requested } = createHarness()
    // A song was already playing when full auto was switched on. Swapping the
    // media src aborts it with emptied/abort, never pause/ended.
    controller.notePlayback(true, false, "manual-song")
    controller.setEnabled(true)
    await flush()
    controller.syncSongs([song("song-1", "complete")])
    expect(plays).toEqual(["song-1"])
    controller.notePlayback(true, false, "song-1")
    await flush()
    expect(requested()).toBe(2)
  })

  test("resuming the same song does not request another one", async () => {
    const { controller, requested } = createHarness()
    controller.setEnabled(true)
    await flush()
    controller.syncSongs([song("song-1", "complete")])
    controller.notePlayback(true, false, "song-1")
    await flush()
    controller.notePlayback(false, false, "song-1")
    controller.notePlayback(true, false, "song-1")
    await flush()
    expect(requested()).toBe(2)
  })

  test("a finished song rolls into the next ready song", async () => {
    const { controller, plays, ended } = createHarness()
    controller.setEnabled(true)
    await flush()
    controller.syncSongs([song("song-1", "complete")])
    controller.notePlayback(true, false, "song-1")
    await flush()
    controller.syncSongs([song("song-1", "complete"), song("song-2", "complete")])
    controller.notePlayback(false, true, "song-1")
    await flush()
    expect(plays).toEqual(["song-1", "song-2"])
    expect(ended).toEqual(["ended"])
  })
})
