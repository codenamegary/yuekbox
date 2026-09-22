import { SongStatus } from "contracts/http/songs"

/** Where a pointer sits on the seek bar, as a 0..1 ratio. Clamped to the ends. */
export const seekRatio = (clientX: number, left: number, width: number): number => {
  if (width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - left) / width))
}

/** The generation panel hides while a complete song plays; pause or stop brings it back. */
export const writerHidden = (playing: boolean, status: SongStatus | null): boolean =>
  playing && status === "complete"
