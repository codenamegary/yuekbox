import { resolve } from "node:path"
import { ServiceState } from "contracts/http/status"
import { buildApp } from "./app"
import { openDatabase } from "./db/client"
import { assembleSongsSlice } from "./songs/songs.assembly"
import { checkFfmpeg } from "./songs/songs.ffmpeg.adapters"
import { checkYue2, yue2ModelPath, yue2VaePath } from "./songs/songs.yue2.adapters"
import { version } from "./version"

const readEnv = () => {
  const kitRoot = process.env.YUE2_KIT ?? resolve(import.meta.dir, "../../../..")
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 8787),
    sqlitePath: process.env.SQLITE_PATH ?? "./data/yuekbox.sqlite",
    kitRoot,
    pythonBin: process.env.YUE2_PYTHON ?? resolve(kitRoot, ".venv/bin/python"),
    scriptBin: resolve(kitRoot, ".venv/bin/yue2"),
    gpuBudget: Number(process.env.YUE2_GPU_BUDGET ?? 16),
    ffmpegBin: process.env.FFMPEG_BIN ?? "ffmpeg",
  }
}

const env = readEnv()
const database = openDatabase({ path: env.sqlitePath })
const songs = assembleSongsSlice({
  db: database.db,
  yue2: {
    kitRoot: env.kitRoot,
    pythonBin: env.pythonBin,
    scriptBin: env.scriptBin,
    gpuBudget: env.gpuBudget,
  },
  ffmpeg: { ffmpegBin: env.ffmpegBin },
})

const recoveredCount = await songs.recoverInterruptedSongs()
if (recoveredCount > 0) {
  console.warn(`marked ${recoveredCount} interrupted song(s) as failed`)
}

const ffmpegState = await checkFfmpeg(env.ffmpegBin)
const yue2State = checkYue2({ kitRoot: env.kitRoot, pythonBin: env.pythonBin })
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

const startedAt = new Date().toISOString()
const serviceState: { value: ServiceState } = { value: "starting" }

const app = buildApp({
  songs,
  status: async () => ({
    version,
    state: serviceState.value,
    ffmpeg: ffmpegState,
    yue2: yue2State,
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
