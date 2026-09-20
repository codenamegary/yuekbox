import { Song } from "../songs/songs.models"
import { visualizationErrorDetail } from "./visualizations.models"
import { AuthorVisualization, WriteVisualizationCode } from "./visualizations.ports"

export type VisualizationAuthoringDeps = Readonly<{
  author: AuthorVisualization
  writeFile: WriteVisualizationCode
  logError?: (message: string, error: unknown) => void
}>

export type VisualizationAuthoring = Readonly<{
  isInFlight: (songId: string) => boolean
  failureFor: (songId: string) => string | null
  start: (song: Song) => void
  drain: () => Promise<void>
}>

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Per-Song authoring state for the life of the process: which runs are in
 * flight and why the last one failed. The file on disk is the durable record;
 * nothing here survives a restart, and a Song left with no visual is repaired
 * by rerolling.
 */
export const makeVisualizationAuthoring = (
  deps: VisualizationAuthoringDeps,
): VisualizationAuthoring => {
  const inFlight = new Map<string, Promise<void>>()
  const failures = new Map<string, string>()

  const run = async (song: Song): Promise<void> => {
    try {
      const authored = await deps.author({ style: song.style, lyrics: song.lyrics })
      if (!authored.ok) {
        failures.set(song.id, visualizationErrorDetail(authored.error.detail))
        return
      }
      try {
        await deps.writeFile(song.id, authored.value.code)
        failures.delete(song.id)
      } catch (error: unknown) {
        failures.set(
          song.id,
          visualizationErrorDetail(`could not write the visualization file: ${messageOf(error)}`),
        )
        deps.logError?.("visualization file write failed", error)
      }
    } catch (error: unknown) {
      failures.set(song.id, visualizationErrorDetail(messageOf(error)))
      deps.logError?.("visualization authoring failed", error)
    }
  }

  const start = (song: Song): void => {
    if (inFlight.has(song.id)) return
    failures.delete(song.id)
    const task = run(song).finally(() => {
      inFlight.delete(song.id)
    })
    inFlight.set(song.id, task)
  }

  return {
    isInFlight: (songId) => inFlight.has(songId),
    failureFor: (songId) => failures.get(songId) ?? null,
    start,
    drain: async () => {
      await Promise.allSettled(inFlight.values())
    },
  }
}
