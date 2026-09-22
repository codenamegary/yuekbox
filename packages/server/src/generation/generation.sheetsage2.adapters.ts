import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ProcessRunner, runProcess } from "../shared/process"
import { err, ok, Result } from "../shared/result"
import { RunTranscribeOutput, TranscribeError } from "./generation.models"
import { RunTranscribe } from "./generation.ports"

export type Sheetsage2AdapterEnv = Readonly<{
  pythonBin: string
  scriptPath: string
  model: string
  baseModel: string | null
  device: string
  offline: boolean
  cwd: string
}>

export const checkSheetsage2 = (
  env: Pick<Sheetsage2AdapterEnv, "pythonBin" | "scriptPath">,
): "ok" | "missing" => (existsSync(env.pythonBin) && existsSync(env.scriptPath) ? "ok" : "missing")

export const sheetsage2BaseModelPath = (kitRoot: string): string =>
  join(kitRoot, "models", "MERT-v2-FullSong")

/**
 * A configured base model wins. Without one, use the kit's local MERT
 * snapshot when it exists, so offline runs work without extra setup.
 */
export const resolveSheetsage2BaseModel = (
  kitRoot: string,
  configured: string | undefined,
): string | null => {
  const trimmed = configured?.trim() ?? ""
  if (trimmed !== "") return trimmed

  const local = sheetsage2BaseModelPath(kitRoot)
  return existsSync(local) ? local : null
}

export type TranscribeArgsInput = Readonly<{
  audioPath: string
  outputDir: string
}>

const sheetsageArgs = (
  env: Sheetsage2AdapterEnv,
  input: TranscribeArgsInput,
  task: "melody-full" | "melody-vocal",
): string[] => [
  env.pythonBin,
  env.scriptPath,
  input.audioPath,
  "--output",
  input.outputDir,
  "--task",
  task,
  "--device",
  env.device,
  "--model",
  env.model,
  ...(env.baseModel !== null ? ["--base-model", env.baseModel] : []),
  ...(env.offline ? ["--offline"] : []),
]

export const transcribeArgs = (env: Sheetsage2AdapterEnv, input: TranscribeArgsInput): string[] =>
  sheetsageArgs(env, input, "melody-full")

const detailLimit = 2000

export const makeRunTranscribe =
  (env: Sheetsage2AdapterEnv, run: ProcessRunner = runProcess): RunTranscribe =>
  async (input): Promise<Result<RunTranscribeOutput, TranscribeError>> => {
    if (checkSheetsage2(env) === "missing") {
      return err({
        kind: "transcribe_failed",
        detail: `sheetsage2 environment missing (python=${env.pythonBin}, script=${env.scriptPath})`,
      })
    }

    if (!existsSync(input.audioPath)) {
      return err({
        kind: "transcribe_failed",
        detail: `reference audio is missing: ${input.audioPath}`,
      })
    }

    const scriptOutputDir = join(input.outputDir, "transcribe")

    const outcome = await run(
      transcribeArgs(env, { audioPath: input.audioPath, outputDir: scriptOutputDir }),
      env.cwd,
      () => {},
    )
    if (outcome.exitCode !== 0) {
      const detail =
        outcome.stderrTail.trim().slice(-detailLimit) ||
        `transcribe.py exited with code ${outcome.exitCode}`
      return err({ kind: "transcribe_failed", detail })
    }

    const scorePath = join(scriptOutputDir, "score.abc")
    if (!existsSync(scorePath)) {
      return err({ kind: "transcribe_failed", detail: "transcribe.py finished without score.abc" })
    }

    return ok({ scoreAbc: await readFile(scorePath, "utf8") })
  }
