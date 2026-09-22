import { ServiceState, Status } from "contracts/http/status"
import { AiSlice, assembleAiSlice } from "./ai/ai.assembly"
import { buildApp } from "./app"
import { Db } from "./db/client"
import { assembleGenerationSlice, GenerationSlice } from "./generation/generation.assembly"
import {
  EncodeFlacToMp3,
  RunLyricAlign,
  RunTranscribe,
  RunVocalTranscript,
  RunYue2Generate,
} from "./generation/generation.ports"
import { assembleMediaSlice, MediaSlice } from "./media/media.assembly"
import { assembleSongsSlice, SongsSlice } from "./songs/songs.assembly"
import {
  assembleVisualizationsSlice,
  VisualizationsSlice,
} from "./visualizations/visualizations.assembly"

export type DependencyStates = Readonly<{
  ffmpeg: "ok" | "missing"
  yue2: "ok" | "missing"
  sheetsage2: "ok" | "missing"
}>

export type ServiceInfo = Readonly<{
  version: string
  state: () => ServiceState
  startedAt: string
}>

export type ComposeDeps = Readonly<{
  db: Db
  mediaDir: string
  runYue2Generate: RunYue2Generate
  runTranscribe: RunTranscribe
  runLyricAlign: RunLyricAlign
  runVocalTranscript: RunVocalTranscript
  encodeFlacToMp3: EncodeFlacToMp3
  referenceMaxBytes: number
  service: ServiceInfo
  dependencies: DependencyStates
  now?: () => string
  logError?: (message: string, error: unknown) => void
}>

export type ComposedServer = Readonly<{
  app: ReturnType<typeof buildApp>
  media: MediaSlice
  songs: SongsSlice
  generation: GenerationSlice
  ai: AiSlice
  visualizations: VisualizationsSlice
}>

export const composeServer = (deps: ComposeDeps): ComposedServer => {
  const media = assembleMediaSlice(deps.mediaDir)

  // Songs is assembled before the visualizations slice it triggers, so the
  // insert hook goes through a forwarder that compose fills in below.
  const songQueued: { request: ((songId: string) => void) | null } = { request: null }

  const songs = assembleSongsSlice({
    db: deps.db,
    media,
    now: deps.now,
    logError: deps.logError,
    onSongQueued: (songId) => songQueued.request?.(songId),
  })
  const generation = assembleGenerationSlice({
    songs: songs.capabilities,
    runYue2Generate: deps.runYue2Generate,
    runTranscribe: deps.runTranscribe,
    runLyricAlign: deps.runLyricAlign,
    runVocalTranscript: deps.runVocalTranscript,
    encodeFlacToMp3: deps.encodeFlacToMp3,
    logError: deps.logError,
  })
  const ai = assembleAiSlice({
    db: deps.db,
    createSong: songs.createSong,
    wake: generation.worker.wake,
    logError: deps.logError,
  })
  const visualizations = assembleVisualizationsSlice({
    findSongById: songs.findSongById,
    readVisualizationFile: songs.readVisualizationFile,
    writeVisualizationFile: songs.writeVisualizationFile,
    readAnalysis: songs.readAnalysisFile,
    canAuthorVisualizations: ai.canAuthorVisualizations,
    authorVisualization: ai.authorVisualization,
    logError: deps.logError,
  })
  songQueued.request = (songId) => {
    visualizations.requestVisualization(songId).catch((error: unknown) => {
      deps.logError?.("visualization request failed", error)
    })
  }

  const status = async (): Promise<Status> => ({
    version: deps.service.version,
    state: deps.service.state(),
    ffmpeg: deps.dependencies.ffmpeg,
    yue2: deps.dependencies.yue2,
    sheetsage2: deps.dependencies.sheetsage2,
    queueDepth: await songs.queueDepth(),
    gpuBusy: generation.worker.isBusy(),
    startedAt: deps.service.startedAt,
  })

  const app = buildApp({
    songs,
    wake: generation.worker.wake,
    referenceMaxBytes: deps.referenceMaxBytes,
    ai,
    visualizations,
    status,
  })

  return { app, media, songs, generation, ai, visualizations }
}
