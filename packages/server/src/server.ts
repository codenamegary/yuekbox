import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { ServiceState } from "contracts/http/status"
import { assembleAiSlice } from "./ai/ai.slice"
import { makeAiConfigStore } from "./ai/ai.config.store"
import { chatCompletion, listModels } from "./ai/ai.openai"
import { buildApp } from "./app"
import { openDatabase } from "./db/client"
import { assembleSongsSlice } from "./songs/songs.assembly"
import {
  makeAudioPath,
  makeListMediaFiles,
  makeMoveAudio,
  makeOpenAudioRange,
  makePutAudio,
  makeReadAudio,
  makeRemoveAudio,
  makeStatAudio,
} from "./songs/songs.media.adapters"
import { checkFfmpeg } from "./songs/songs.ffmpeg.adapters"
import { checkSheetsage2 } from "./songs/songs.sheetsage2.adapters"
import { checkYue2, yue2ModelPath, yue2VaePath } from "./songs/songs.yue2.adapters"
import { version } from "./version"

const referencePurgeAgeMs = 24 * 60 * 60 * 1000

const readEnv = () => {
  const kitRoot = process.env.YUE2_KIT ?? resolve(import.meta.dir, "../../../..")
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 8787),
    sqlitePath: process.env.SQLITE_PATH ?? "./data/yuekbox.sqlite",
    mediaDir: process.env.MEDIA_DIR ?? "./data/media",
    kitRoot,
    pythonBin: process.env.YUE2_PYTHON ?? resolve(kitRoot, ".venv/bin/python"),
    scriptBin: resolve(kitRoot, ".venv/bin/yue2"),
    gpuBudget: Number(process.env.YUE2_GPU_BUDGET ?? 16),
    ffmpegBin: process.env.FFMPEG_BIN ?? "ffmpeg",
    sheetsage2Python:
      process.env.SHEETSAGE2_PYTHON ?? resolve(kitRoot, ".venv-sheetsage2/bin/python"),
    sheetsage2Script:
      process.env.SHEETSAGE2_SCRIPT ?? resolve(kitRoot, "skills/yue2-music/scripts/transcribe.py"),
    sheetsage2Model: process.env.SHEETSAGE2_MODEL ?? resolve(kitRoot, "models/SheetSage2"),
    sheetsage2BaseModel: process.env.SHEETSAGE2_BASE_MODEL ?? null,
    sheetsage2Device: process.env.SHEETSAGE2_DEVICE ?? "cuda",
    sheetsage2Offline: process.env.SHEETSAGE2_OFFLINE !== "0",
    referenceMaxBytes: Number(process.env.REFERENCE_MAX_BYTES ?? 26214400),
  }
}

const env = readEnv()
const database = openDatabase({ path: env.sqlitePath })
const songs = assembleSongsSlice({
  db: database.db,
  audioPath: makeAudioPath(env.mediaDir),
  putAudio: makePutAudio(env.mediaDir),
  statAudio: makeStatAudio(env.mediaDir),
  readAudio: makeReadAudio(env.mediaDir),
  openAudioRange: makeOpenAudioRange(env.mediaDir),
  moveAudio: makeMoveAudio(env.mediaDir),
  removeAudio: makeRemoveAudio(env.mediaDir),
  listMediaFiles: makeListMediaFiles(env.mediaDir),
  yue2: {
    kitRoot: env.kitRoot,
    pythonBin: env.pythonBin,
    scriptBin: env.scriptBin,
    gpuBudget: env.gpuBudget,
  },
  sheetsage2: {
    pythonBin: env.sheetsage2Python,
    scriptPath: env.sheetsage2Script,
    model: env.sheetsage2Model,
    baseModel: env.sheetsage2BaseModel,
    device: env.sheetsage2Device,
    offline: env.sheetsage2Offline,
    cwd: env.kitRoot,
  },
  ffmpeg: { ffmpegBin: env.ffmpegBin },
})

const ai = assembleAiSlice({
  configStore: makeAiConfigStore(database.db),
  chat: chatCompletion,
  listModels,
  songs,
})

const recoveredCount = await songs.recoverInterruptedSongs()
if (recoveredCount > 0) {
  console.warn(`marked ${recoveredCount} interrupted song(s) as failed`)
}

const purgedReferences = await songs.purgeStaleReferences(
  new Date(Date.now() - referencePurgeAgeMs).toISOString(),
)
if (purgedReferences > 0) {
  console.warn(`purged ${purgedReferences} unattached reference upload(s)`)
}

const reconciled = await songs.reconcileMedia()
if (reconciled.removedOrphanFiles > 0) {
  console.warn(`removed ${reconciled.removedOrphanFiles} orphan media file(s)`)
}
if (reconciled.failedSongIds.length > 0) {
  console.warn(
    `marked ${reconciled.failedSongIds.length} complete song(s) failed: audio file missing`,
  )
}
if (reconciled.missingReferenceCount > 0) {
  console.warn(
    `${reconciled.missingReferenceCount} reference audio file(s) missing; those songs fail at transcription`,
  )
}

const ffmpegState = await checkFfmpeg(env.ffmpegBin)
const yue2State = checkYue2({ kitRoot: env.kitRoot, pythonBin: env.pythonBin })
const sheetsage2State = checkSheetsage2({
  pythonBin: env.sheetsage2Python,
  scriptPath: env.sheetsage2Script,
})
if (ffmpegState === "missing") {
  console.warn(
    `ffmpeg with libmp3lame not found (FFMPEG_BIN=${env.ffmpegBin}); generates will fail`,
  )
}
if (yue2State === "missing") {
  console.warn(
    `yue2 not found (python=${env.pythonBin}, model=${yue2ModelPath(env.kitRoot)}, vae=${yue2VaePath(env.kitRoot)}); generates will fail`,
  )
}
if (sheetsage2State === "missing") {
  console.warn(
    `sheetsage2 not found (python=${env.sheetsage2Python}, script=${env.sheetsage2Script}, model=${env.sheetsage2Model}); reference covers will fail`,
  )
} else if (!existsSync(env.sheetsage2Model)) {
  console.warn(
    `sheetsage2 model not found at ${env.sheetsage2Model}; reference covers will fail until it is downloaded`,
  )
}

const startedAt = new Date().toISOString()
const serviceState: { value: ServiceState } = { value: "starting" }

const app = buildApp({
  songs,
  referenceMaxBytes: env.referenceMaxBytes,
  ai,
  status: async () => ({
    version,
    state: serviceState.value,
    ffmpeg: ffmpegState,
    yue2: yue2State,
    sheetsage2: sheetsage2State,
    queueDepth: await songs.queueDepth(),
    gpuBusy: songs.worker.isBusy(),
    startedAt,
  }),
})

await app.listen({ host: env.host, port: env.port })
serviceState.value = "online"
console.log(`yuekbox server listening on http://${env.host}:${env.port}`)

const shutdown = async (signal: string) => {
  serviceState.value = "shutting_down"
  console.log(`received ${signal}; shutting down`)
  await app.close()
  database.close()
  process.exit(0)
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM")
})
process.on("SIGINT", () => {
  void shutdown("SIGINT")
})
