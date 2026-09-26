import { describe, expect, test } from "bun:test"
import {
  FullAutoEvent,
  FullAutoState,
  initialFullAutoState,
  stepFullAuto,
} from "./songs.fullauto.machine"

const step = (state: FullAutoState, ...events: readonly FullAutoEvent[]): FullAutoState =>
  events.reduce((current, event) => stepFullAuto(current, event).state, state)

describe("stepFullAuto", () => {
  test("enable kicks off the first generation", () => {
    const { state, commands } = stepFullAuto(initialFullAutoState, { type: "enable" })
    expect(state.phase).toBe("generating")
    expect(state.requesting).toBe(true)
    expect(commands.map((command) => command.kind)).toEqual(["requestRandom"])
  })

  test("enable is idempotent while a generation is already running", () => {
    const first = stepFullAuto(initialFullAutoState, { type: "enable" })
    const second = stepFullAuto(first.state, { type: "enable" })
    expect(second.commands).toEqual([])
  })

  test("a requested song is watched while nothing plays", () => {
    const enabled = stepFullAuto(initialFullAutoState, { type: "enable" })
    const { state, commands } = stepFullAuto(enabled.state, {
      type: "requested",
      songId: "song-1",
    })
    expect(state.generatingId).toBe("song-1")
    expect(commands.map((command) => command.kind)).toEqual(["watch"])
  })

  test("a requested song is not watched while another song plays", () => {
    const state = step(
      initialFullAutoState,
      { type: "enable" },
      { type: "requested", songId: "song-1" },
      { type: "songComplete", songId: "song-1" },
      // song-1 is now playing; its completion triggered the next request
      { type: "requested", songId: "song-2" },
    )
    expect(state.phase).toBe("playing")
    expect(state.generatingId).toBe("song-2")
  })

  test("as soon as playback starts, the next generation begins", () => {
    const state = step(
      initialFullAutoState,
      { type: "enable" },
      { type: "requested", songId: "song-1" },
      { type: "songComplete", songId: "song-1" },
    )
    const { state: next, commands } = stepFullAuto(state, {
      type: "playbackStarted",
      songId: "song-1",
    })
    expect(next.phase).toBe("playing")
    expect(commands.map((command) => command.kind)).toEqual(["requestRandom"])
  })

  test("a finished generation waits as next while a song plays", () => {
    const state = step(
      initialFullAutoState,
      { type: "enable" },
      { type: "requested", songId: "song-1" },
      { type: "songComplete", songId: "song-1" },
      { type: "playbackStarted", songId: "song-1" },
      { type: "requested", songId: "song-2" },
    )
    const { state: next, commands } = stepFullAuto(state, {
      type: "songComplete",
      songId: "song-2",
    })
    expect(next.nextId).toBe("song-2")
    expect(next.phase).toBe("playing")
    expect(commands).toEqual([])
  })

  test("ended playback rolls straight into the next song", () => {
    const state = step(
      initialFullAutoState,
      { type: "enable" },
      { type: "requested", songId: "song-1" },
      { type: "songComplete", songId: "song-1" },
      { type: "playbackStarted", songId: "song-1" },
      { type: "requested", songId: "song-2" },
      { type: "songComplete", songId: "song-2" },
    )
    const { commands } = stepFullAuto(state, { type: "playbackEnded" })
    expect(commands.map((command) => command.kind)).toEqual(["play"])
    expect((commands[0] as { songId?: string }).songId).toBe("song-2")
  })

  test("ended playback with nothing ready goes starved and recovers", () => {
    const starved = step(
      initialFullAutoState,
      { type: "enable" },
      { type: "requested", songId: "song-1" },
      { type: "songComplete", songId: "song-1" },
      { type: "playbackStarted", songId: "song-1" },
      { type: "playbackEnded" },
    )
    expect(starved.phase).toBe("starved")
    // the in-flight request lands, is watched, finishes, and plays
    const watching = step(starved, { type: "requested", songId: "song-2" })
    expect(watching.phase).toBe("generating")
    const { state: next, commands } = stepFullAuto(watching, {
      type: "songComplete",
      songId: "song-2",
    })
    expect(next.phase).toBe("playing")
    expect(commands.map((command) => command.kind)).toEqual(["play"])
  })

  test("a failed generation requests another one", () => {
    const state = step(
      initialFullAutoState,
      { type: "enable" },
      { type: "requested", songId: "song-1" },
    )
    const { state: next, commands } = stepFullAuto(state, { type: "songFailed", songId: "song-1" })
    expect(next.generatingId).toBeNull()
    expect(commands.map((command) => command.kind)).toEqual(["requestRandom"])
  })

  test("disable resets everything", () => {
    const state = step(
      initialFullAutoState,
      { type: "enable" },
      { type: "requested", songId: "song-1" },
    )
    const { state: next } = stepFullAuto(state, { type: "disable" })
    expect(next).toEqual(initialFullAutoState)
  })

  test("events are ignored while idle", () => {
    const { state, commands } = stepFullAuto(initialFullAutoState, {
      type: "playbackEnded",
    })
    expect(state).toEqual(initialFullAutoState)
    expect(commands).toEqual([])
  })
})
