import * as React from "react"
import { Song } from "contracts/http/songs"
import { AudioEngine } from "./songs.audio.engine"
import {
  FullAutoCommand,
  FullAutoEvent,
  FullAutoState,
  initialFullAutoState,
  stepFullAuto,
} from "./songs.fullauto.machine"

type UseFullAutoOptions = Readonly<{
  enabled: boolean
  audio: AudioEngine
  activeSongId: string | null
  /** Every known song, newest first: the machine watches the one generating. */
  songs: readonly Song[]
  /** Called when full auto wants a song queued up and shown. */
  onWatch: (songId: string) => void
  /** Called when full auto wants a song to start playing right now. */
  onPlay: (songId: string) => void
  /** Called when a song finishes playing while full auto is running. */
  onTrackEnded: () => void
  /** Kicks the server for a brand new random song. Resolves with its id. */
  requestRandom: () => Promise<string | null>
}>

type FullAutoHandlers = Readonly<{
  onWatch: (songId: string) => void
  onPlay: (songId: string) => void
  onTrackEnded: () => void
  requestRandom: () => Promise<string | null>
}>

const retryDelayMs = 8000

/**
 * The always-on jukebox controller: one song playing, the next one always
 * generating. Plain closure state (like the audio and winamp engines), so the
 * machine lives entirely outside React's render rules.
 */
export const createFullAutoController = () => {
  let state: FullAutoState = initialFullAutoState
  let handlers: FullAutoHandlers = {
    onWatch: () => {},
    onPlay: () => {},
    onTrackEnded: () => {},
    requestRandom: async () => null,
  }
  let requestInFlight = false
  let retryTimer: number | null = null
  let playingSongId: string | null = null
  const listeners = new Set<() => void>()

  const publish = (next: FullAutoState) => {
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  const runRequest = () => {
    if (requestInFlight) return
    requestInFlight = true
    void handlers
      .requestRandom()
      .then((songId) => {
        requestInFlight = false
        if (songId === null) {
          transition({ type: "requestFailed" })
          if (retryTimer === null) {
            retryTimer = window.setTimeout(() => {
              retryTimer = null
              runRequest()
            }, retryDelayMs)
          }
          return
        }
        transition({ type: "requested", songId })
      })
      .catch(() => {
        requestInFlight = false
      })
  }

  const execute = (command: FullAutoCommand) => {
    if (command.kind === "requestRandom") {
      runRequest()
    } else if (command.kind === "play") {
      handlers.onPlay(command.songId)
    } else {
      handlers.onWatch(command.songId)
    }
  }

  const transition = (event: FullAutoEvent) => {
    const { state: next, commands } = stepFullAuto(state, event)
    publish(next)
    for (const command of commands) execute(command)
  }

  return {
    configure: (next: FullAutoHandlers) => {
      handlers = next
    },

    setEnabled: (enabled: boolean) => {
      if (enabled) {
        transition({ type: "enable" })
        return
      }
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
      requestInFlight = false
      transition({ type: "disable" })
    },

    /** Completion and failure of the generating song arrive through the songs list. */
    syncSongs: (songs: readonly Song[]) => {
      const generatingId = state.generatingId
      if (generatingId === null) return
      const song = songs.find((entry) => entry.id === generatingId)
      if (song === undefined) return
      if (song.status === "complete") {
        transition({ type: "songComplete", songId: generatingId })
      } else if (song.status === "failed") {
        transition({ type: "songFailed", songId: generatingId })
      }
    },

    /**
     * Playback edges. A new song id is a start even when the previous song was
     * interrupted without a pause or ended event (the media element reloads).
     */
    notePlayback: (playing: boolean, ended: boolean, songId: string | null) => {
      if (playing) {
        const id = songId ?? ""
        if (playingSongId === id) return
        playingSongId = id
        transition({ type: "playbackStarted", songId: id })
        return
      }
      const finishedId = playingSongId
      playingSongId = null
      if (ended && finishedId !== null) {
        const wasRolling = state.phase === "playing"
        transition({ type: "playbackEnded" })
        if (wasRolling) handlers.onTrackEnded()
      }
    },

    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    getSnapshot: (): FullAutoState => state,
  }
}

export type FullAutoController = ReturnType<typeof createFullAutoController>

/**
 * Full random mode: keep one song generating at all times, play each new song
 * the moment it lands, and start writing the next one the moment playback
 * starts. Runs itself; never asks the human anything.
 */
export const useFullAuto = (options: UseFullAutoOptions): FullAutoState => {
  const { enabled, audio, activeSongId, songs, onWatch, onPlay, onTrackEnded, requestRandom } =
    options

  const [controller] = React.useState(() => createFullAutoController())

  React.useEffect(() => {
    controller.configure({ onWatch, onPlay, onTrackEnded, requestRandom })
  })

  React.useEffect(() => {
    controller.setEnabled(enabled)
  }, [controller, enabled])

  React.useEffect(() => {
    controller.syncSongs(songs)
  }, [controller, songs])

  React.useEffect(() => {
    return audio.subscribe(() => {
      controller.notePlayback(audio.isPlaying(), audio.isEnded(), activeSongId)
    })
  }, [audio, activeSongId, controller])

  return React.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
}
