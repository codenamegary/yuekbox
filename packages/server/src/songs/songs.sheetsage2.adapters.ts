import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ProcessRunner, runProcess } from "../shared/process"
import { err, ok, Result } from "../shared/result"
import { TranscribeError } from "./songs.models"
import { RunTranscribe, RunTranscribeOutput } from "./songs.ports"

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

export type TranscribeArgsInput = Readonly<{
  audioPath: string
  outputDir: string
}>

export const transcribeArgs = (env: Sheetsage2AdapterEnv, input: TranscribeArgsInput): string[] => [
  env.pythonBin,
  env.scriptPath,
  input.audioPath,
  "--output",
  input.outputDir,
  "--task",
  "melody-full",
  "--device",
  env.device,
  "--model",
  env.model,
  ...(env.baseModel !== null ? ["--base-model", env.baseModel] : []),
  ...(env.offline ? ["--offline"] : []),
]

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
