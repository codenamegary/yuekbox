import { existsSync } from "node:fs"
import { AddressInfo } from "node:net"
import { homedir } from "node:os"
import { ServiceState } from "contracts/http/status"
import { composeServer } from "./compose"
import { BootEnv, resolveBootEnv } from "./config/config.boot"
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
import { assembleProvisioningSlice } from "./provisioning/provisioning.assembly"
import { runProvisioningCommand } from "./provisioning/provisioning.cli"
import { version } from "./version"

export type StartServerInput = Readonly<{
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
  /** The OS user home; yuekbox's home defaults to `<osHome>/.yuekbox`. */
  osHome: string
  /**
   * The packaged binary's one-process mode: Fastify binds a loopback port the
   * OS picks, so the SPA listener is the only known port. The assigned port
   * comes back on `RunningServer.port`.
   */
  standalone?: boolean
  /**
   * The packaged binary owns its Python helpers, so it installs them from the
   * embedded tools tree before the dependency checks run. Dev leaves this
   * undefined; `--provision` installs its own copy and exits first.
   */
  ensureScripts?: (boot: BootEnv) => Promise<void>
}>

export type RunningServer = Readonly<{
  host: string
  port: number
  close: () => Promise<void>
}>

const readAssignedPort = (address: AddressInfo | string | null, fallback: number): number =>
  typeof address === "object" && address !== null ? address.port : fallback

/**
 * Resolves the boot env, runs the `--provision` CLI or the boot-time script
 * install, composes the app, and listens. Shared by both process roots:
 * `bun --hot src/server.ts` (dev, Fastify + packages/web/src/serve.ts) and the
 * compiled binary (`binary.ts`, one process).
 */
export const startServer = async (input: StartServerInput): Promise<RunningServer> => {
  const boot = await resolveBootEnv({
    argv: input.argv,
    env: input.env,
    osHome: input.osHome,
    loadModelOverrides: (configFilePath) => makeLoadModelOverrides(configFilePath)(),
  })

  if (boot.provision) {
    const provisioning = assembleProvisioningSlice({ home: boot.home })
    process.exit(
      await runProvisioningCommand({
        home: boot.home,
        provisionAll: provisioning.provisionAll,
        log: (line: string) => console.log(line),
      }),
    )
  }

  await input.ensureScripts?.(boot)

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

  const host = input.standalone === true ? "127.0.0.1" : boot.host
  const requestedPort = input.standalone === true ? 0 : boot.port
  await app.listen({ host, port: requestedPort })
  const port = readAssignedPort(app.server.address(), requestedPort)
  serviceState.value = "online"
  console.log(`yuekbox server listening on http://${host}:${port}`)

  const close = async (): Promise<void> => {
    serviceState.value = "shutting_down"
    await app.close()
    database.close()
  }

  return { host, port, close }
}

if (import.meta.main) {
  const running = await startServer({ argv: Bun.argv, env: process.env, osHome: homedir() })

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`received ${signal}; shutting down`)
    await running.close()
    process.exit(0)
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM")
  })
  process.on("SIGINT", () => {
    void shutdown("SIGINT")
  })
}
