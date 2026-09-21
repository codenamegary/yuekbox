import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { VocalSpan } from "contracts/http/songs"
import { ProcessRunner, runProcess } from "../shared/process"
import { err, ok, Result } from "../shared/result"
import {
  RunTranscribeOutput,
  RunVocalTranscribeOutput,
  TranscribeError,
  VocalTranscribeError,
} from "./generation.models"
import { RunTranscribe, RunVocalTranscribe } from "./generation.ports"

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

export const vocalTranscribeArgs = (
  env: Sheetsage2AdapterEnv,
  input: TranscribeArgsInput,
): string[] => sheetsageArgs(env, input, "melody-vocal")

const vocalBreathGapSeconds = 0.35

type NoteSpan = Readonly<{ startSeconds: number; endSeconds: number }>

const parseVocalNote = (line: string): NoteSpan | null => {
  const [startText, endText] = line.trim().split(/\s+/)
  const startSeconds = Number.parseFloat(startText ?? "")
  const endSeconds = Number.parseFloat(endText ?? "")
  if (
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    endSeconds <= startSeconds
  ) {
    return null
  }
  return { startSeconds, endSeconds }
}

/** Groups SheetSage2 note rows into phrase spans, split at a gap over a breath. */
export const groupVocalSpans = (lab: string, durationSeconds: number): readonly VocalSpan[] => {
  const notes = lab
    .split("\n")
    .flatMap((line) => {
      const note = parseVocalNote(line)
      if (note === null) return []
      const startSeconds = Math.max(0, Math.min(note.startSeconds, durationSeconds))
      const endSeconds = Math.max(0, Math.min(note.endSeconds, durationSeconds))
      return endSeconds > startSeconds ? [{ startSeconds, endSeconds }] : []
    })
    .sort((left, right) => left.startSeconds - right.startSeconds)

  const spans: { startSeconds: number; endSeconds: number; noteCount: number }[] = []
  for (const note of notes) {
    const current = spans.at(-1)
    if (current !== undefined && note.startSeconds - current.endSeconds <= vocalBreathGapSeconds) {
      current.endSeconds = Math.max(current.endSeconds, note.endSeconds)
      current.noteCount += 1
    } else {
      spans.push({ startSeconds: note.startSeconds, endSeconds: note.endSeconds, noteCount: 1 })
    }
  }
  return spans
}

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

export const makeRunVocalTranscribe =
  (env: Sheetsage2AdapterEnv, run: ProcessRunner = runProcess): RunVocalTranscribe =>
  async (input): Promise<Result<RunVocalTranscribeOutput, VocalTranscribeError>> => {
    if (checkSheetsage2(env) === "missing") {
      return err({
        kind: "vocal_transcribe_failed",
        detail: `sheetsage2 environment missing (python=${env.pythonBin}, script=${env.scriptPath})`,
      })
    }

    if (!existsSync(input.audioPath)) {
      return err({
        kind: "vocal_transcribe_failed",
        detail: `generated audio is missing: ${input.audioPath}`,
      })
    }

    const scriptOutputDir = join(input.outputDir, "sync")

    const outcome = await run(
      vocalTranscribeArgs(env, { audioPath: input.audioPath, outputDir: scriptOutputDir }),
      env.cwd,
      () => {},
    )
    if (outcome.exitCode !== 0) {
      const detail =
        outcome.stderrTail.trim().slice(-detailLimit) ||
        `transcribe.py exited with code ${outcome.exitCode}`
      return err({ kind: "vocal_transcribe_failed", detail })
    }

    const labPath = join(scriptOutputDir, "melody_vocal.lab")
    if (!existsSync(labPath)) {
      return err({
        kind: "vocal_transcribe_failed",
        detail: "transcribe.py finished without melody_vocal.lab",
      })
    }

    const spans: readonly VocalSpan[] = groupVocalSpans(
      await readFile(labPath, "utf8"),
      input.durationSeconds,
    )
    return ok({ spans })
  }
