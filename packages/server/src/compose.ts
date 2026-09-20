import { ServiceState, Status } from "contracts/http/status"
import { AiSlice } from "./ai/ai.models"
import { assembleAiSlice } from "./ai/ai.slice"
import { makeAiConfigStore } from "./ai/ai.config.sqlite.adapters"
import { chatCompletion, listModels } from "./ai/ai.openai.adapters"
import { buildApp } from "./app"
import { Db } from "./db/client"
import { assembleGenerationSlice, GenerationSlice } from "./generation/generation.assembly"
import { EncodeFlacToMp3, RunTranscribe, RunYue2Generate } from "./generation/generation.ports"
import { assembleMediaSlice, MediaSlice } from "./media/media.assembly"
import { assembleSongsSlice, SongsSlice } from "./songs/songs.assembly"

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
}>

export const composeServer = (deps: ComposeDeps): ComposedServer => {
  const media = assembleMediaSlice(deps.mediaDir)
  const songs = assembleSongsSlice({
    db: deps.db,
    media,
    now: deps.now,
    logError: deps.logError,
  })
  const generation = assembleGenerationSlice({
    songs: songs.capabilities,
    runYue2Generate: deps.runYue2Generate,
    runTranscribe: deps.runTranscribe,
    encodeFlacToMp3: deps.encodeFlacToMp3,
    logError: deps.logError,
  })
  const ai = assembleAiSlice({
    configStore: makeAiConfigStore(deps.db),
    chat: chatCompletion,
    listModels,
    createSong: songs.createSong,
    wake: generation.worker.wake,
    logError: deps.logError,
  })

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
    status,
  })

  return { app, media, songs, generation, ai }
}
