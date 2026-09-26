import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Calibration, CalibrationSchema } from "contracts/http/songs"
import { ReadCurrentModelPaths } from "../config/config.current"
import { ProcessRunner, runProcess } from "../shared/process"
import { err, ok, Result } from "../shared/result"
import { LyricAlignError, RunLyricAlignOutput } from "./generation.models"
import { RunLyricAlign } from "./generation.ports"

export type LyricAlignAdapterEnv = Readonly<{
  pythonBin: string
  scriptPath: string
  device: string
  cwd: string
  /** Resolved at call time, so a path saved before the next run is used. */
  readModelPaths: ReadCurrentModelPaths
}>

/** One run's flags, after the model paths are resolved. */
export type LyricAlignArgsEnv = Readonly<{
  pythonBin: string
  scriptPath: string
  device: string
  whisperModel: string
}>

export const checkLyricAlign = (
  env: Pick<LyricAlignAdapterEnv, "pythonBin" | "scriptPath">,
): "ok" | "missing" => (existsSync(env.pythonBin) && existsSync(env.scriptPath) ? "ok" : "missing")

export type LyricAlignArgsInput = Readonly<{
  audioPath: string
  outputDir: string
}>

const lyricAlignDir = (outputDir: string): string => join(outputDir, "lyric-align")

const calibrationPath = (outputDir: string): string =>
  join(lyricAlignDir(outputDir), "calibration.json")

export const lyricAlignArgs = (env: LyricAlignArgsEnv, input: LyricAlignArgsInput): string[] => [
  env.pythonBin,
  env.scriptPath,
  "--audio",
  input.audioPath,
  "--out",
  lyricAlignDir(input.outputDir),
  "--calibration-out",
  calibrationPath(input.outputDir),
  "--whisper-model",
  env.whisperModel,
  "--device",
  env.device,
]

const parseCalibration = (text: string): Calibration | null => {
  try {
    const parsed = CalibrationSchema.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const detailLimit = 2000

export const makeRunLyricAlign =
  (env: LyricAlignAdapterEnv, run: ProcessRunner = runProcess): RunLyricAlign =>
  async (input): Promise<Result<RunLyricAlignOutput, LyricAlignError>> => {
    if (checkLyricAlign(env) === "missing") {
      return err({
        kind: "lyric_align_failed",
        detail: `lyric-align environment missing (python=${env.pythonBin}, script=${env.scriptPath})`,
      })
    }

    if (!existsSync(input.audioPath)) {
      return err({
        kind: "lyric_align_failed",
        detail: `generated audio is missing: ${input.audioPath}`,
      })
    }

    // Resolve the whisper path now: a config save between songs is honored here.
    const modelPaths = await env.readModelPaths()
    const outcome = await run(
      lyricAlignArgs(
        {
          pythonBin: env.pythonBin,
          scriptPath: env.scriptPath,
          device: env.device,
          whisperModel: modelPaths.whisper,
        },
        input,
      ),
      env.cwd,
      () => {},
    )
    if (outcome.exitCode !== 0) {
      const detail =
        outcome.stderrTail.trim().slice(-detailLimit) ||
        `align.py exited with code ${outcome.exitCode}`
      return err({ kind: "lyric_align_failed", detail })
    }

    const path = calibrationPath(input.outputDir)
    if (!existsSync(path)) {
      return err({
        kind: "lyric_align_failed",
        detail: "align.py finished without calibration.json",
      })
    }

    const calibration = parseCalibration(await readFile(path, "utf8"))
    if (calibration === null) {
      return err({
        kind: "lyric_align_failed",
        detail: "align.py wrote a calibration that does not match the contract",
      })
    }

    return ok({ calibration })
  }
