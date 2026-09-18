import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
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

const isVisibleCharacter = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0
  return code > 0x1f && code !== 0x7f
}

export const safeReferenceFilename = (filename: string): string => {
  let withoutControl = ""
  for (const character of filename) {
    if (isVisibleCharacter(character)) withoutControl += character
  }
  const plain = basename(withoutControl.replace(/\\/g, "/")).trim()
  if (plain === "" || plain === "." || plain === "..") return "reference"
  return plain
}

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

    const audioPath = join(input.outputDir, safeReferenceFilename(input.filename))
    const scriptOutputDir = join(input.outputDir, "transcribe")
    await writeFile(audioPath, input.audio)

    const outcome = await run(
      transcribeArgs(env, { audioPath, outputDir: scriptOutputDir }),
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
