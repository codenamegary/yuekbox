export type FullAutoPhase = "idle" | "generating" | "playing" | "starved"

export type FullAutoState = Readonly<{
  phase: FullAutoPhase
  generatingId: string | null
  nextId: string | null
  requesting: boolean
}>

export type FullAutoEvent =
  | Readonly<{ type: "enable" }>
  | Readonly<{ type: "disable" }>
  | Readonly<{ type: "requested"; songId: string }>
  | Readonly<{ type: "requestFailed" }>
  | Readonly<{ type: "songComplete"; songId: string }>
  | Readonly<{ type: "songFailed"; songId: string }>
  | Readonly<{ type: "playbackStarted"; songId: string }>
  | Readonly<{ type: "playbackEnded" }>

export type FullAutoCommand =
  | Readonly<{ kind: "requestRandom" }>
  | Readonly<{ kind: "play"; songId: string }>
  | Readonly<{ kind: "watch"; songId: string }>

export type FullAutoTransition = Readonly<{
  state: FullAutoState
  commands: readonly FullAutoCommand[]
}>

export const initialFullAutoState: FullAutoState = {
  phase: "idle",
  generatingId: null,
  nextId: null,
  requesting: false,
}

/**
 * The always-on jukebox: one song playing, the next one always generating.
 * Pure on purpose — the hook only executes commands.
 */
export const stepFullAuto = (state: FullAutoState, event: FullAutoEvent): FullAutoTransition => {
  switch (event.type) {
    case "enable": {
      if (state.phase !== "idle") return { state, commands: [] }
      if (state.generatingId !== null || state.nextId !== null || state.requesting) {
        return {
          state: { ...state, phase: state.nextId !== null ? "starved" : state.phase },
          commands: [],
        }
      }
      return {
        state: { ...state, phase: "generating", requesting: true },
        commands: [{ kind: "requestRandom" }],
      }
    }

    case "disable":
      return { state: initialFullAutoState, commands: [] }

    case "requested": {
      if (state.phase === "idle") return { state, commands: [] }
      const wasPlaying = state.phase === "playing"
      return {
        state: {
          ...state,
          generatingId: event.songId,
          requesting: false,
          phase: wasPlaying ? "playing" : "generating",
        },
        commands: wasPlaying ? [] : [{ kind: "watch", songId: event.songId }],
      }
    }

    case "requestFailed": {
      if (state.phase === "idle") return { state, commands: [] }
      return { state: { ...state, requesting: false }, commands: [] }
    }

    case "songComplete": {
      if (state.generatingId !== event.songId && state.nextId !== event.songId) {
        return { state, commands: [] }
      }
      const readyId = event.songId
      const generating = state.generatingId === event.songId ? null : state.generatingId
      if (state.phase === "playing") {
        return { state: { ...state, generatingId: generating, nextId: readyId }, commands: [] }
      }
      return {
        state: {
          ...state,
          generatingId: generating,
          nextId: null,
          phase: "playing",
        },
        commands: [{ kind: "play", songId: readyId }],
      }
    }

    case "songFailed": {
      if (state.generatingId !== event.songId) return { state, commands: [] }
      const wasPlaying = state.phase === "playing"
      return {
        state: {
          ...state,
          generatingId: null,
          phase: wasPlaying ? "playing" : "generating",
          requesting: true,
        },
        commands: [{ kind: "requestRandom" }],
      }
    }

    case "playbackStarted": {
      if (state.phase === "idle") return { state, commands: [] }
      const needsRequest = state.generatingId === null && state.nextId === null && !state.requesting
      return {
        state: { ...state, phase: "playing", requesting: needsRequest ? true : state.requesting },
        commands: needsRequest ? [{ kind: "requestRandom" }] : [],
      }
    }

    case "playbackEnded": {
      if (state.phase !== "playing") return { state, commands: [] }
      if (state.nextId !== null) {
        const next = state.nextId
        return {
          state: { ...state, nextId: null, phase: "playing" },
          commands: [{ kind: "play", songId: next }],
        }
      }
      return { state: { ...state, phase: "starved" }, commands: [] }
    }
  }
}
