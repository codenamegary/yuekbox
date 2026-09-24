export type OverlayPhase = "hidden" | "shown" | "closing"

export type OverlayState = Readonly<{
  phase: OverlayPhase
}>

export type OverlayEvent =
  | Readonly<{ type: "generate" }>
  | Readonly<{ type: "show" }>
  | Readonly<{ type: "dismiss" }>
  | Readonly<{ type: "songComplete" }>
  | Readonly<{ type: "songFailed" }>
  | Readonly<{ type: "closeElapsed" }>

export const initialOverlayState: OverlayState = { phase: "hidden" }

/** How long the reel rests on the terminal word before it fades out. */
export const overlayCloseDelayMs = 1200

/**
 * The generating overlay's visibility. Pure on purpose — the page only runs it
 * and wires the close timer. Generate always shows, dismiss always wins, and
 * completion fades a visible overlay without ever reviving a dismissed one.
 */
export const stepOverlay = (state: OverlayState, event: OverlayEvent): OverlayState => {
  switch (event.type) {
    case "generate":
    case "show":
      return { phase: "shown" }

    case "dismiss":
      return initialOverlayState

    case "songComplete":
      return state.phase === "shown" ? { phase: "closing" } : state

    case "songFailed":
      return state

    case "closeElapsed":
      return state.phase === "closing" ? initialOverlayState : state
  }
}
