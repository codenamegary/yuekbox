import { join } from "node:path"
import { ModelPathOverrides, ModelPaths } from "contracts/http/config"
import {
  defaultHome,
  generateScriptPath,
  lyricAlignScriptPath,
  mediaDir,
  pythonPath,
  sheetsage2ScriptPath,
  sqlitePath,
} from "../shared/home"
import { resolveModelPaths } from "./config.resolve"

export type BootEnv = Readonly<{
  home: string
  configFilePath: string
  flags: ModelPathOverrides
  modelPaths: ModelPaths
  /** `--provision`: build the runtime into the home, print progress, exit. */
  provision: boolean
  host: string
  port: number
  sqlitePath: string
  mediaDir: string
  /** The one shared interpreter every Python pass runs. */
  python: string
  generateScript: string
  gpuBudget: number
  ffmpegBin: string
  sheetsage2Script: string
  sheetsage2Device: string
  sheetsage2Offline: boolean
  lyricAlignScript: string
  lyricAlignDevice: string
  referenceMaxBytes: number
}>

export type BootEnvInput = Readonly<{
  /** `--home`, already resolved; null means `<osHome>/.yuekbox`. */
  home: string | null
  /** `--config`, already resolved; null means `<home>/config.yaml`. */
  configPath: string | null
  /** CLI model overrides, the highest precedence. */
  models: ModelPathOverrides
  /** `--provision`: build the runtime into the home, print progress, exit. */
  provision: boolean
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
 *
 * The command line is parsed exactly once by the calling process root and its
 * output is spread in here: the dev root uses `parseCliArgs`, the cli package
 * uses commander. This function never sees raw argv.
 */
export const resolveBootEnv = async (input: BootEnvInput): Promise<BootEnv> => {
  const home = input.home ?? defaultHome(input.osHome)
  const configFilePath = input.configPath ?? join(home, "config.yaml")
  const modelPaths = resolveModelPaths({
    home,
    file: await input.loadModelOverrides(configFilePath),
    flags: input.models,
  })
  const env = input.env

  return Object.freeze({
    home,
    configFilePath,
    flags: input.models,
    modelPaths,
    provision: input.provision,
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 8787),
    sqlitePath: env.SQLITE_PATH ?? sqlitePath(home),
    mediaDir: env.MEDIA_DIR ?? mediaDir(home),
    python: env.YUEKBOX_PYTHON ?? pythonPath(home),
    generateScript: generateScriptPath(home),
    gpuBudget: Number(env.YUE2_GPU_BUDGET ?? 16),
    ffmpegBin: env.FFMPEG_BIN ?? "ffmpeg",
    sheetsage2Script: env.SHEETSAGE2_SCRIPT ?? sheetsage2ScriptPath(home),
    sheetsage2Device: env.SHEETSAGE2_DEVICE ?? "cuda",
    sheetsage2Offline: env.SHEETSAGE2_OFFLINE !== "0",
    lyricAlignScript: env.LYRIC_ALIGN_SCRIPT ?? lyricAlignScriptPath(home),
    lyricAlignDevice: env.LYRIC_ALIGN_DEVICE ?? "cuda:0",
    referenceMaxBytes: Number(env.REFERENCE_MAX_BYTES ?? 26214400),
  })
}
