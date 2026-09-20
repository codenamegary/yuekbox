import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { SongStage } from "contracts/http/songs"
import { z } from "zod"
import { runProcess } from "../shared/process"
import { err, ok, Result } from "../shared/result"
import { TruncatedFlags } from "../songs/songs.models"
import { GenerateSongError, RunYue2GenerateInput, RunYue2GenerateOutput } from "./generation.models"
import { RunYue2Generate } from "./generation.ports"

export type Yue2AdapterEnv = Readonly<{
  kitRoot: string
  pythonBin: string
  scriptBin: string
  gpuBudget: number
}>

const stageMarkers: ReadonlyArray<readonly [string, SongStage]> = [
  ["Planning score", "plan"],
  ["Generating song", "semantic"],
  ["Synthesizing audio", "synthesize"],
  ["Decoding audio", "decode"],
]

export type Yue2LineEvent =
  | Readonly<{ kind: "stage"; stage: SongStage }>
  | Readonly<{ kind: "progress"; stage: SongStage; completed: number; total: number }>

const progressPattern = /(\d+)\/(\d+)\s+\S+\s+\(\d+%\)/

export const parseYue2Line = (line: string): Yue2LineEvent | null => {
  const marker = stageMarkers.find((entry) => line.includes(entry[0]))
  if (marker === undefined) return null

  const stage = marker[1]
  const match = progressPattern.exec(line)
  if (match === null) return { kind: "stage", stage }

  const completed = Number.parseInt(match[1] ?? "", 10)
  const total = Number.parseInt(match[2] ?? "", 10)
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) {
    return { kind: "stage", stage }
  }

  return { kind: "progress", stage, completed: Math.min(completed, total), total }
}

const resultFileSchema = z.object({
  status: z.string(),
  audio_seconds: z.number(),
  truncated: z.object({ abc: z.boolean(), semantic: z.boolean() }),
})

export const yue2ModelPath = (kitRoot: string) => join(kitRoot, "models", "YuE2-3B")
export const yue2VaePath = (kitRoot: string) => join(kitRoot, "models", "YuE2-Vae")

export const checkYue2 = (env: Pick<Yue2AdapterEnv, "kitRoot" | "pythonBin">): "ok" | "missing" =>
  existsSync(env.pythonBin) &&
  existsSync(yue2ModelPath(env.kitRoot)) &&
  existsSync(yue2VaePath(env.kitRoot))
    ? "ok"
    : "missing"

const generateArgs = (env: Yue2AdapterEnv, input: RunYue2GenerateInput, requestPath: string) => [
  "generate",
  "--request",
  requestPath,
  "--output",
  join(input.outputDir, "out"),
  "--model",
  yue2ModelPath(env.kitRoot),
  "--vae",
  yue2VaePath(env.kitRoot),
  "--budget",
  String(env.gpuBudget),
  "--offline",
  "--device",
  "cuda",
]

export const makeRunYue2Generate =
  (env: Yue2AdapterEnv): RunYue2Generate =>
  async (input): Promise<Result<RunYue2GenerateOutput, GenerateSongError>> => {
    const requestPath = join(input.outputDir, "request.json")
    await writeFile(
      requestPath,
      `${JSON.stringify(
        {
          id: input.songId,
          style: input.style,
          lyrics: input.lyrics,
          cot: input.cot,
          seed: input.seed,
          ...(input.abc !== null ? { abc: input.abc } : {}),
        },
        null,
        2,
      )}\n`,
      "utf8",
    )

    const seenStages: SongStage[] = []
    const noteStage = (stage: SongStage) => {
      if (!seenStages.includes(stage)) {
        seenStages.push(stage)
        input.onStage(stage)
      }
    }
    const parseLine = (line: string) => {
      const event = parseYue2Line(line)
      if (event === null) return
      noteStage(event.stage)
      if (event.kind === "progress") {
        input.onProgress({
          stage: event.stage,
          completed: event.completed,
          total: event.total,
        })
      }
    }

    const args = generateArgs(env, input, requestPath)
    const first = await runProcess([env.pythonBin, "-m", "yue2", ...args], env.kitRoot, parseLine)

    let outcome = first
    if (first.exitCode !== 0 && first.stderrTail.includes("No module named")) {
      outcome = await runProcess([env.scriptBin, ...args], env.kitRoot, parseLine)
    }

    if (outcome.exitCode !== 0) {
      const detail =
        outcome.stderrTail.trim().slice(-2000) || `yue2 exited with code ${outcome.exitCode}`
      return err({ kind: "yue2_failed", detail })
    }

    const songDir = join(input.outputDir, "out", input.songId)
    const flacPath = join(songDir, "audio.flac")
    if (!existsSync(flacPath)) {
      return err({ kind: "yue2_failed", detail: "yue2 finished without audio.flac" })
    }

    const resultPath = join(songDir, "result.json")
    if (!existsSync(resultPath)) {
      return err({ kind: "yue2_failed", detail: "yue2 finished without result.json" })
    }
    const parsedResult = resultFileSchema.safeParse(JSON.parse(await readFile(resultPath, "utf8")))
    if (!parsedResult.success) {
      return err({
        kind: "yue2_failed",
        detail: "yue2 result.json did not match the expected shape",
      })
    }

    const scorePath = join(songDir, "score.abc")
    const scoreAbc = existsSync(scorePath) ? await readFile(scorePath, "utf8") : null

    const truncated: TruncatedFlags = {
      abc: parsedResult.data.truncated.abc,
      semantic: parsedResult.data.truncated.semantic,
    }

    return ok({
      flacPath,
      scoreAbc,
      durationSeconds: parsedResult.data.audio_seconds,
      truncated,
      stages: seenStages,
    })
  }
