import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProcessRunner } from "../shared/process"
import {
  makeRunTranscribe,
  makeRunVocalTranscript,
  parseAnalysisBeats,
  parseAnalysisNotes,
  parseAnalysisSections,
  Sheetsage2AdapterEnv,
  transcribeArgs,
  vocalTranscribeArgs,
} from "./generation.sheetsage2.adapters"

const env: Sheetsage2AdapterEnv = {
  pythonBin: process.execPath,
  scriptPath: import.meta.path,
  model: "/kit/models/SheetSage2",
  baseModel: "/kit/models/MERT-v2-FullSong",
  device: "cuda",
  offline: true,
  cwd: "/kit",
}

test("transcribe args select melody-full and pass the local model chain", () => {
  const args = transcribeArgs(env, { audioPath: "/tmp/ref/demo.mp3", outputDir: "/tmp/ref/out" })

  expect(args.slice(0, 3)).toEqual([env.pythonBin, env.scriptPath, "/tmp/ref/demo.mp3"])
  expect(args).toContain("melody-full")
  expect(args).toContain("/tmp/ref/out")
  expect(args.at(-1)).toBe("--offline")
  expect(args.join(" ")).toContain("--base-model /kit/models/MERT-v2-FullSong")
})

test("transcribe args omit optional flags when unset", () => {
  const args = transcribeArgs(
    { ...env, baseModel: null, offline: false },
    { audioPath: "/tmp/ref.wav", outputDir: "/tmp/out" },
  )

  expect(args).not.toContain("--base-model")
  expect(args).not.toContain("--offline")
})

test("vocal transcript args select melody-vocal", () => {
  const args = vocalTranscribeArgs(env, { audioPath: "/tmp/gen.flac", outputDir: "/tmp/out" })

  expect(args.slice(0, 3)).toEqual([env.pythonBin, env.scriptPath, "/tmp/gen.flac"])
  expect(args).toContain("melody-vocal")
  expect(args).toContain("/tmp/out")
})

test("parseAnalysisNotes reads start, end, and pitch, sorted and clamped", () => {
  const lab = [
    "4.500000\t5.000000\t64",
    "1.000000\t1.400000\t60",
    "9.000000\t11.000000\t62",
    "2.000000\t2.500000\t200",
    "3.000000\tbad\t60",
    "",
    "not a row",
  ].join("\n")

  expect(parseAnalysisNotes(lab, 10)).toEqual([
    { startSeconds: 1, endSeconds: 1.4, pitch: 60 },
    { startSeconds: 4.5, endSeconds: 5, pitch: 64 },
    { startSeconds: 9, endSeconds: 10, pitch: 62 },
  ])
})

test("parseAnalysisNotes drops notes that clamp to nothing", () => {
  expect(parseAnalysisNotes("12.000000\t13.000000\t60", 10)).toEqual([])
})

test("parseAnalysisBeats reads the bar position and drops rows outside the bar", () => {
  const lab = [
    "0.500000\t2\t4\t4",
    "0.000000\t1\t4\t4",
    "1.000000\t5\t4\t4",
    "2.000000\tx\t4\t4",
  ].join("\n")

  expect(parseAnalysisBeats(lab, 10)).toEqual([
    { time: 0, position: 1, beatsPerBar: 4, beatUnit: 4 },
    { time: 0.5, position: 2, beatsPerBar: 4, beatUnit: 4 },
  ])
})

test("parseAnalysisSections keeps labels and drops empty spans", () => {
  const lab = [
    "8.000000\t40.000000\tverse",
    "0.000000\t8.000000\tintro",
    "40.000000\t99.000000\tpost-chorus",
    "50.000000\t50.000000\toutro",
  ].join("\n")

  expect(parseAnalysisSections(lab, 45)).toEqual([
    { name: "intro", startSeconds: 0, endSeconds: 8 },
    { name: "verse", startSeconds: 8, endSeconds: 40 },
    { name: "post-chorus", startSeconds: 40, endSeconds: 45 },
  ])
})

test("a successful vocal transcript returns the slices and the output tree", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runner = makeFakeRunner(async (outputDir) => {
      await mkdir(outputDir, { recursive: true })
      await writeFile(
        join(outputDir, "melody_vocal.lab"),
        "1.000000\t2.000000\t60\n4.000000\t5.000000\t62\n",
        "utf8",
      )
      await writeFile(join(outputDir, "beat.lab"), "0.000000\t1\t4\t4\n", "utf8")
      await writeFile(join(outputDir, "structure.lab"), "0.000000\t8.000000\tintro\n", "utf8")
      await writeFile(join(outputDir, "score.abc"), "X:1\nK:C\nC D E|", "utf8")
      return 0
    })
    const runTranscript = makeRunVocalTranscript(env, runner)

    const result = await runTranscript({ audioPath, outputDir: outputRoot, durationSeconds: 10 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.notes).toEqual([
      { startSeconds: 1, endSeconds: 2, pitch: 60 },
      { startSeconds: 4, endSeconds: 5, pitch: 62 },
    ])
    expect(result.value.beats).toEqual([{ time: 0, position: 1, beatsPerBar: 4, beatUnit: 4 }])
    expect(result.value.sections).toEqual([{ name: "intro", startSeconds: 0, endSeconds: 8 }])
    expect(result.value.transcriptDir).toBe(join(outputRoot, "transcript"))
  })
})

test("a vocal transcript without a melody lab fails", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runner = makeFakeRunner(async (outputDir) => {
      await mkdir(outputDir, { recursive: true })
      return 0
    })
    const runTranscript = makeRunVocalTranscript(env, runner)

    const result = await runTranscript({ audioPath, outputDir: outputRoot, durationSeconds: 10 })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.detail).toContain("melody_vocal.lab")
  })
})

test("a missing beat or structure file leaves that slice empty", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runner = makeFakeRunner(async (outputDir) => {
      await mkdir(outputDir, { recursive: true })
      await writeFile(join(outputDir, "melody_vocal.lab"), "1.000000\t2.000000\t60\n", "utf8")
      return 0
    })
    const runTranscript = makeRunVocalTranscript(env, runner)

    const result = await runTranscript({ audioPath, outputDir: outputRoot, durationSeconds: 10 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.beats).toEqual([])
    expect(result.value.sections).toEqual([])
  })
})

test("a vocal transcript against missing audio fails before a run", async () => {
  const runner = makeFakeRunner(async () => {
    throw new Error("the runner must not be called")
  })
  const runTranscript = makeRunVocalTranscript(env, runner)

  const result = await runTranscript({
    audioPath: "/tmp/does-not-exist.flac",
    outputDir: "/tmp/out",
    durationSeconds: 10,
  })

  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error.detail).toContain("generated audio is missing")
})

const makeFakeRunner =
  (behavior: (outputDir: string) => Promise<number> | number): ProcessRunner =>
  async (command) => {
    const outputIndex = command.indexOf("--output")
    const outputDir = command[outputIndex + 1] ?? ""
    const exitCode = await behavior(outputDir)
    return { exitCode, stdout: "", stderrTail: exitCode === 0 ? "" : "traceback: no module" }
  }

const withStoredAudio = async (
  run: (audioPath: string, outputRoot: string) => Promise<void>,
): Promise<void> => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-transcribe-test-"))
  try {
    const audioPath = join(outputRoot, "demo.mp3")
    await writeFile(audioPath, new Uint8Array([1, 2, 3]))
    await run(audioPath, outputRoot)
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
}

test("successful transcription returns the score ABC", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runner = makeFakeRunner(async (outputDir) => {
      await mkdir(outputDir, { recursive: true })
      await writeFile(join(outputDir, "score.abc"), "X:1\nK:C\nC D E|", "utf8")
      return 0
    })
    const runTranscribe = makeRunTranscribe(env, runner)

    const result = await runTranscribe({ audioPath, outputDir: outputRoot })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.scoreAbc).toBe("X:1\nK:C\nC D E|")
  })
})

test("the script receives the stored path without a temp copy", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const commands: string[][] = []
    const runner = makeFakeRunner(async (outputDir) => {
      await mkdir(outputDir, { recursive: true })
      await writeFile(join(outputDir, "score.abc"), "X:1\nK:C\nC D E|", "utf8")
      return 0
    })
    const capturingRunner: ProcessRunner = async (command, cwd, onOutput) => {
      commands.push([...command])
      return runner(command, cwd, onOutput)
    }
    const runTranscribe = makeRunTranscribe(env, capturingRunner)

    const result = await runTranscribe({ audioPath, outputDir: outputRoot })

    expect(result.ok).toBe(true)
    expect(commands).toHaveLength(1)
    expect(commands[0]?.[2]).toBe(audioPath)
    expect((await readdir(outputRoot)).toSorted()).toEqual(["demo.mp3", "transcribe"])
  })
})

test("a non-zero exit is a transcribe failure with the stderr tail", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runTranscribe = makeRunTranscribe(
      env,
      makeFakeRunner(() => 1),
    )

    const result = await runTranscribe({ audioPath, outputDir: outputRoot })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("transcribe_failed")
    expect(result.error.detail).toContain("no module")
  })
})

test("a run without score.abc is a transcribe failure", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runTranscribe = makeRunTranscribe(
      env,
      makeFakeRunner(() => 0),
    )

    const result = await runTranscribe({ audioPath, outputDir: outputRoot })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.detail).toContain("score.abc")
  })
})

test("a missing audio file fails before spawning", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-transcribe-test-"))
  try {
    const spawns: string[] = []
    const runner: ProcessRunner = async (command) => {
      spawns.push(command[2] ?? "")
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const runTranscribe = makeRunTranscribe(env, runner)

    const result = await runTranscribe({
      audioPath: join(outputRoot, "missing.mp3"),
      outputDir: outputRoot,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.detail).toContain("reference audio is missing")
    expect(spawns).toEqual([])
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test("a missing sheetsage2 environment fails before spawning", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-transcribe-test-"))
  try {
    const spawns: string[] = []
    const runner: ProcessRunner = async (command) => {
      spawns.push(command[2] ?? "")
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const runTranscribe = makeRunTranscribe({ ...env, pythonBin: "/kit/nope/python" }, runner)

    const result = await runTranscribe({
      audioPath: join(outputRoot, "demo.mp3"),
      outputDir: outputRoot,
    })

    expect(result.ok).toBe(false)
    expect(spawns).toEqual([])
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})
