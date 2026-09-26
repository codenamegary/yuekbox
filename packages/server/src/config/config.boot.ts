import { join } from "node:path"
import { ModelPathOverrides, ModelPaths } from "contracts/http/config"
import {
  defaultHome,
  lyricAlignPythonPath,
  lyricAlignScriptPath,
  mediaDir,
  sheetsage2PythonPath,
  sheetsage2ScriptPath,
  sqlitePath,
  yue2PythonPath,
  yue2ScriptPath,
} from "../shared/home"
import { parseCliArgs } from "./config.argv"
import { resolveModelPaths } from "./config.resolve"

export type BootEnv = Readonly<{
  home: string
  configFilePath: string
  flags: ModelPathOverrides
  modelPaths: ModelPaths
  host: string
  port: number
  sqlitePath: string
  mediaDir: string
  yue2Python: string
  yue2Script: string
  gpuBudget: number
  ffmpegBin: string
  sheetsage2Python: string
  sheetsage2Script: string
  sheetsage2Device: string
  sheetsage2Offline: boolean
  lyricAlignPython: string
  lyricAlignScript: string
  lyricAlignDevice: string
  referenceMaxBytes: number
}>

export type BootEnvInput = Readonly<{
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
  /** The OS user home; yuekbox's home defaults to `<osHome>/.yuekbox`. */
  osHome: string
  /** Loads config.yaml once from the resolved path. */
  loadModelOverrides: (configFilePath: string) => Promise<ModelPathOverrides>
}>

/**
 * The process root's boot resolution, all in one place: home, config file, the
 * five model paths, and the home-based defaults for everything the app manages.
 * Only the model paths are user-configurable; the env vars below are internal
 * escape hatches and never part of the user surface.
 */
export const resolveBootEnv = async (input: BootEnvInput): Promise<BootEnv> => {
  const cli = parseCliArgs(input.argv)
  const home = cli.home ?? defaultHome(input.osHome)
  const configFilePath = cli.configPath ?? join(home, "config.yaml")
  const modelPaths = resolveModelPaths({
    home,
    file: await input.loadModelOverrides(configFilePath),
    flags: cli.models,
  })
  const env = input.env

  return Object.freeze({
    home,
    configFilePath,
    flags: cli.models,
    modelPaths,
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 8787),
    sqlitePath: env.SQLITE_PATH ?? sqlitePath(home),
    mediaDir: env.MEDIA_DIR ?? mediaDir(home),
    yue2Python: env.YUE2_PYTHON ?? yue2PythonPath(home),
    yue2Script: yue2ScriptPath(home),
    gpuBudget: Number(env.YUE2_GPU_BUDGET ?? 16),
    ffmpegBin: env.FFMPEG_BIN ?? "ffmpeg",
    sheetsage2Python: env.SHEETSAGE2_PYTHON ?? sheetsage2PythonPath(home),
    sheetsage2Script: env.SHEETSAGE2_SCRIPT ?? sheetsage2ScriptPath(home),
    sheetsage2Device: env.SHEETSAGE2_DEVICE ?? "cuda",
    sheetsage2Offline: env.SHEETSAGE2_OFFLINE !== "0",
    lyricAlignPython: env.LYRIC_ALIGN_PYTHON ?? lyricAlignPythonPath(home),
    lyricAlignScript: env.LYRIC_ALIGN_SCRIPT ?? lyricAlignScriptPath(home),
    lyricAlignDevice: env.LYRIC_ALIGN_DEVICE ?? "cuda:0",
    referenceMaxBytes: Number(env.REFERENCE_MAX_BYTES ?? 26214400),
  })
}
