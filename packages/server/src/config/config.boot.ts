import { join } from "node:path"
import { ModelPathOverrides, ModelPaths } from "contracts/http/config"
import {
  alignPythonPath,
  defaultHome,
  generateScriptPath,
  lyricAlignScriptPath,
  mediaDir,
  pythonPath,
  sheetsage2ScriptPath,
  sqlitePath,
} from "../shared/home"
import { HostPlatform, hostPlatform } from "../shared/platform"
import { resolveModelPaths } from "./config.resolve"

export type BootEnv = Readonly<{
  platform: HostPlatform
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
  /** The shared interpreter: every Linux pass, and the macOS generation pass. */
  python: string
  /** The lyric aligner's interpreter: the same one on Linux, the align venv on macOS. */
  alignPython: string
  generateScript: string
  gpuBudget: number
  ffmpegBin: string
  sheetsage2Script: string
  sheetsage2Device: string
  sheetsage2Offline: boolean
  lyricAlignScript: string
  lyricAlignDevice: string
  /** The MLX quantization the macOS generation runtime loads. */
  mlxPrecision: string
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
  /** Defaults to the machine the process runs on; tests pass one explicitly. */
  platform?: HostPlatform
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
 *
 * The platform only moves the defaults: macOS points the aligner at its own
 * torch-based environment, defaults both transcription devices away from
 * CUDA, and records the MLX quantization to load.
 */
export const resolveBootEnv = async (input: BootEnvInput): Promise<BootEnv> => {
  const platform = input.platform ?? hostPlatform()
  const home = input.home ?? defaultHome(input.osHome)
  const configFilePath = input.configPath ?? join(home, "config.yaml")
  const modelPaths = resolveModelPaths({
    home,
    file: await input.loadModelOverrides(configFilePath),
    flags: input.models,
  })
  const env = input.env

  return Object.freeze({
    platform,
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
    alignPython:
      env.YUEKBOX_ALIGN_PYTHON ?? (platform === "macos" ? alignPythonPath(home) : pythonPath(home)),
    generateScript: generateScriptPath(home),
    gpuBudget: Number(env.YUE2_GPU_BUDGET ?? 16),
    ffmpegBin: env.FFMPEG_BIN ?? "ffmpeg",
    sheetsage2Script: env.SHEETSAGE2_SCRIPT ?? sheetsage2ScriptPath(home),
    sheetsage2Device: env.SHEETSAGE2_DEVICE ?? (platform === "macos" ? "cpu" : "cuda"),
    sheetsage2Offline: env.SHEETSAGE2_OFFLINE !== "0",
    lyricAlignScript: env.LYRIC_ALIGN_SCRIPT ?? lyricAlignScriptPath(home),
    lyricAlignDevice: env.LYRIC_ALIGN_DEVICE ?? (platform === "macos" ? "cpu" : "cuda:0"),
    mlxPrecision: env.YUEKBOX_MLX_PRECISION ?? "8bit",
    referenceMaxBytes: Number(env.REFERENCE_MAX_BYTES ?? 26214400),
  })
}
