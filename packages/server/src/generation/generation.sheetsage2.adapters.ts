import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { AnalysisBeat, AnalysisNote, AnalysisSection } from "contracts/http/visualizations"
import { ProcessRunner, runProcess } from "../shared/process"
import { err, ok, Result } from "../shared/result"
import {
  RunTranscribeOutput,
  RunVocalTranscriptOutput,
  TranscribeError,
  VocalTranscriptError,
} from "./generation.models"
import { RunTranscribe, RunVocalTranscript } from "./generation.ports"

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

/** The transcript output directory inside a temp dir. The raw tree is kept from here. */
export const transcriptDirectoryName = "transcript"

const labRows = (text: string): readonly (readonly string[])[] =>
  text.split("\n").flatMap((line) => {
    const trimmed = line.trim()
    return trimmed === "" ? [] : [trimmed.split(/\s+/)]
  })

const clampSeconds = (value: number, durationSeconds: number): number =>
  Math.max(0, Math.min(value, durationSeconds))

/** `melody_vocal.lab` rows: start seconds, end seconds, MIDI pitch. */
export const parseAnalysisNotes = (lab: string, durationSeconds: number): AnalysisNote[] => {
  const notes: AnalysisNote[] = []
  for (const row of labRows(lab)) {
    const start = Number.parseFloat(row[0] ?? "")
    const end = Number.parseFloat(row[1] ?? "")
    const pitch = Number.parseInt(row[2] ?? "", 10)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) continue
    const startSeconds = clampSeconds(start, durationSeconds)
    const endSeconds = clampSeconds(end, durationSeconds)
    if (endSeconds <= startSeconds) continue
    notes.push(Object.freeze({ startSeconds, endSeconds, pitch }))
  }
  return notes.toSorted((left, right) => left.startSeconds - right.startSeconds)
}

/** `beat.lab` rows: time seconds, 1-based position in the bar, beats per bar, beat unit. */
export const parseAnalysisBeats = (lab: string, durationSeconds: number): AnalysisBeat[] => {
  const beats: AnalysisBeat[] = []
  for (const row of labRows(lab)) {
    const time = Number.parseFloat(row[0] ?? "")
    const position = Number.parseInt(row[1] ?? "", 10)
    const beatsPerBar = Number.parseInt(row[2] ?? "", 10)
    const beatUnit = Number.parseInt(row[3] ?? "", 10)
    if (!Number.isFinite(time)) continue
    if (!Number.isInteger(position) || position < 1) continue
    if (!Number.isInteger(beatsPerBar) || beatsPerBar < 1) continue
    if (position > beatsPerBar) continue
    if (!Number.isInteger(beatUnit) || beatUnit < 1) continue
    beats.push(
      Object.freeze({ time: clampSeconds(time, durationSeconds), position, beatsPerBar, beatUnit }),
    )
  }
  return beats.toSorted((left, right) => left.time - right.time)
}

/** `structure.lab` rows: start seconds, end seconds, label such as verse or chorus. */
export const parseAnalysisSections = (lab: string, durationSeconds: number): AnalysisSection[] => {
  const sections: AnalysisSection[] = []
  for (const row of labRows(lab)) {
    const start = Number.parseFloat(row[0] ?? "")
    const end = Number.parseFloat(row[1] ?? "")
    const name = row.slice(2).join(" ").trim()
    if (!Number.isFinite(start) || !Number.isFinite(end) || name === "") continue
    const startSeconds = clampSeconds(start, durationSeconds)
    const endSeconds = clampSeconds(end, durationSeconds)
    if (endSeconds <= startSeconds) continue
    sections.push(Object.freeze({ name, startSeconds, endSeconds }))
  }
  return sections.toSorted((left, right) => left.startSeconds - right.startSeconds)
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

/**
 * Transcribes the rendered Song's vocal melody, beat grid, and structure. The
 * raw output tree stays on disk and is handed back for the Song folder.
 */
export const makeRunVocalTranscript =
  (env: Sheetsage2AdapterEnv, run: ProcessRunner = runProcess): RunVocalTranscript =>
  async (input): Promise<Result<RunVocalTranscriptOutput, VocalTranscriptError>> => {
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

    const transcriptDir = join(input.outputDir, transcriptDirectoryName)
    const outcome = await run(
      vocalTranscribeArgs(env, { audioPath: input.audioPath, outputDir: transcriptDir }),
      env.cwd,
      () => {},
    )
    if (outcome.exitCode !== 0) {
      const detail =
        outcome.stderrTail.trim().slice(-detailLimit) ||
        `transcribe.py exited with code ${outcome.exitCode}`
      return err({ kind: "vocal_transcribe_failed", detail })
    }

    const notesPath = join(transcriptDir, "melody_vocal.lab")
    if (!existsSync(notesPath)) {
      return err({
        kind: "vocal_transcribe_failed",
        detail: "transcribe.py finished without melody_vocal.lab",
      })
    }

    const beatsPath = join(transcriptDir, "beat.lab")
    const structurePath = join(transcriptDir, "structure.lab")
    const notes = parseAnalysisNotes(await readFile(notesPath, "utf8"), input.durationSeconds)
    const beats = existsSync(beatsPath)
      ? parseAnalysisBeats(await readFile(beatsPath, "utf8"), input.durationSeconds)
      : []
    const sections = existsSync(structurePath)
      ? parseAnalysisSections(await readFile(structurePath, "utf8"), input.durationSeconds)
      : []

    return ok({ notes, beats, sections, transcriptDir })
  }
