import { AiConfig, AiConfigPatch, Preset, WriterScope } from "contracts/http/ai"
import { Db } from "../db/client"
import { Result } from "../shared/result"
import { Song } from "../songs/songs.models"
import { CreateSong } from "../songs/songs.ports"
import {
  makeLoadConfig,
  makeLoadStoredConfig,
  makeSaveConfig as makeSaveConfigAdapter,
} from "./ai.config.sqlite.adapters"
import { makeAuthorVisualization } from "./ai.author-visualization.usecase"
import { makeEnhance } from "./ai.enhance.usecase"
import { makeFetchModels } from "./ai.fetch-models.usecase"
import { makeGetConfig } from "./ai.get-config.usecase"
import { makeListPresets } from "./ai.list-presets.usecase"
import {
  AiModelsResult,
  AiNotReadyError,
  EnhanceError,
  EnhanceInput,
  RandomSongError,
  VisualizationAuthorError,
  VisualizationAuthorInput,
} from "./ai.models"
import { chatCompletion, listModels } from "./ai.openai.adapters"
import { knownPresets } from "./ai.presets"
import { makeRandomSong } from "./ai.random-song.usecase"
import { makeSaveConfig } from "./ai.save-config.usecase"
import { visualizationSetting } from "./ai.settings"

export type AiSlice = Readonly<{
  listPresets: () => readonly Preset[]
  getConfig: () => Promise<AiConfig>
  saveConfig: (patch: AiConfigPatch) => Promise<AiConfig>
  fetchModels: (scope: WriterScope) => Promise<AiModelsResult>
  enhance: (input: EnhanceInput) => Promise<Result<string, EnhanceError>>
  randomSong: () => Promise<Result<Song, RandomSongError>>
  /** Whether the visuals writer can author right now, without spending a call. */
  canAuthorVisualizations: () => Promise<Result<null, AiNotReadyError>>
  authorVisualization: (
    input: VisualizationAuthorInput,
  ) => Promise<Result<Readonly<{ code: string }>, VisualizationAuthorError>>
}>

export type AiSliceDeps = Readonly<{
  db: Db
  createSong: CreateSong
  wake: () => void
  now?: () => string
  logError?: (message: string, error: unknown) => void
}>

export const assembleAiSlice = (deps: AiSliceDeps): AiSlice => {
  const loadConfig = makeLoadConfig(deps.db)
  const loadStoredConfig = makeLoadStoredConfig(deps.db)

  return {
    listPresets: makeListPresets({ presets: knownPresets }),
    getConfig: makeGetConfig({ loadConfig }),
    saveConfig: makeSaveConfig({ saveConfig: makeSaveConfigAdapter(deps.db, deps.now) }),
    fetchModels: makeFetchModels({ loadStoredConfig, listModels }),
    enhance: makeEnhance({ loadStoredConfig, chat: chatCompletion, logError: deps.logError }),
    randomSong: makeRandomSong({
      loadStoredConfig,
      chat: chatCompletion,
      createSong: deps.createSong,
      wake: deps.wake,
      logError: deps.logError,
    }),
    canAuthorVisualizations: async () => visualizationSetting(await loadStoredConfig()),
    authorVisualization: makeAuthorVisualization({
      loadStoredConfig,
      chat: chatCompletion,
      logError: deps.logError,
    }),
  }
}
