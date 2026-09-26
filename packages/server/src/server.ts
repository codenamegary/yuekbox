import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { ServiceState } from "contracts/http/status"
import { composeServer } from "./compose"
import { resolveBootEnv } from "./config/config.boot"
import { makeLoadModelOverrides } from "./config/config.yaml.adapters"
import { openDatabase } from "./db/client"
import { checkFfmpeg, makeEncodeFlacToMp3 } from "./generation/generation.ffmpeg.adapters"
import {
  checkLyricAlign,
  LyricAlignAdapterEnv,
  makeRunLyricAlign,
} from "./generation/generation.lyricalign.adapters"
import {
  checkSheetsage2,
  makeRunTranscribe,
  makeRunVocalTranscript,
  Sheetsage2AdapterEnv,
} from "./generation/generation.sheetsage2.adapters"
import { checkYue2, makeRunYue2Generate } from "./generation/generation.yue2.adapters"
import { version } from "./version"

const boot = await resolveBootEnv({
  argv: Bun.argv,
  env: process.env,
  osHome: homedir(),
  loadModelOverrides: (configFilePath) => makeLoadModelOverrides(configFilePath)(),
})

const database = openDatabase({ path: boot.sqlitePath })

const ffmpegState = await checkFfmpeg(boot.ffmpegBin)
const yue2State = checkYue2({
  pythonBin: boot.yue2Python,
  scriptPath: boot.generateScript,
  model: boot.modelPaths.yue2,
  vae: boot.modelPaths.yue2Vae,
})
const sheetsage2State = checkSheetsage2({
  pythonBin: boot.sheetsage2Python,
  scriptPath: boot.sheetsage2Script,
})
const lyricAlignState = checkLyricAlign({
  pythonBin: boot.lyricAlignPython,
  scriptPath: boot.lyricAlignScript,
})
if (ffmpegState === "missing") {
  console.warn(
    `ffmpeg with libmp3lame not found (FFMPEG_BIN=${boot.ffmpegBin}); generates will fail`,
  )
}
if (yue2State === "missing") {
  console.warn(
    `yue2 not found (python=${boot.yue2Python}, script=${boot.generateScript}, model=${boot.modelPaths.yue2}, vae=${boot.modelPaths.yue2Vae}); generates will fail`,
  )
}
if (sheetsage2State === "missing") {
  console.warn(
    `sheetsage2 not found (python=${boot.sheetsage2Python}, script=${boot.sheetsage2Script}, model=${boot.modelPaths.sheetsage2}); reference covers will fail`,
  )
} else if (!existsSync(boot.modelPaths.sheetsage2)) {
  console.warn(
    `sheetsage2 model not found at ${boot.modelPaths.sheetsage2}; reference covers will fail until it is downloaded`,
  )
}
if (lyricAlignState === "missing") {
  console.warn(
    `lyric-align not found (python=${boot.lyricAlignPython}, script=${boot.lyricAlignScript}); songs will complete without lyric cues`,
  )
}

const startedAt = new Date().toISOString()
const serviceState: { value: ServiceState } = { value: "starting" }

const sheetsage2Env: Sheetsage2AdapterEnv = {
  pythonBin: boot.sheetsage2Python,
  scriptPath: boot.sheetsage2Script,
  model: boot.modelPaths.sheetsage2,
  baseModel: boot.modelPaths.sheetsage2Base,
  device: boot.sheetsage2Device,
  offline: boot.sheetsage2Offline,
  cwd: boot.home,
}

const lyricAlignEnv: LyricAlignAdapterEnv = {
  pythonBin: boot.lyricAlignPython,
  scriptPath: boot.lyricAlignScript,
  device: boot.lyricAlignDevice,
  cwd: boot.home,
}

const { app, songs } = composeServer({
  db: database.db,
  mediaDir: boot.mediaDir,
  config: {
    home: boot.home,
    configFilePath: boot.configFilePath,
    flags: boot.flags,
  },
  runYue2Generate: makeRunYue2Generate({
    pythonBin: boot.yue2Python,
    scriptPath: boot.generateScript,
    model: boot.modelPaths.yue2,
    vae: boot.modelPaths.yue2Vae,
    gpuBudget: boot.gpuBudget,
    cwd: boot.home,
  }),
  runTranscribe: makeRunTranscribe(sheetsage2Env),
  runLyricAlign: makeRunLyricAlign(lyricAlignEnv),
  runVocalTranscript: makeRunVocalTranscript(sheetsage2Env),
  encodeFlacToMp3: makeEncodeFlacToMp3({ ffmpegBin: boot.ffmpegBin }),
  referenceMaxBytes: boot.referenceMaxBytes,
  service: {
    version,
    state: () => serviceState.value,
    startedAt,
  },
  dependencies: {
    ffmpeg: ffmpegState,
    yue2: yue2State,
    sheetsage2: sheetsage2State,
  },
})

const recoveredCount = await songs.recoverInterruptedSongs()
if (recoveredCount > 0) {
  console.warn(`marked ${recoveredCount} interrupted song(s) as failed`)
}

await app.listen({ host: boot.host, port: boot.port })
serviceState.value = "online"
console.log(`yuekbox server listening on http://${boot.host}:${boot.port}`)

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
