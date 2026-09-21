import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProcessRunner } from "../shared/process"
import {
  groupVocalSpans,
  makeRunTranscribe,
  makeRunVocalTranscribe,
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

test("vocal transcribe args select melody-vocal into the sync folder", () => {
  const args = vocalTranscribeArgs(env, {
    audioPath: "/tmp/out/audio.flac",
    outputDir: "/tmp/out/sync",
  })

  expect(args.slice(0, 3)).toEqual([env.pythonBin, env.scriptPath, "/tmp/out/audio.flac"])
  expect(args).toContain("melody-vocal")
  expect(args).toContain("/tmp/out/sync")
  expect(args).toContain("--model")
  expect(args).toContain("/kit/models/SheetSage2")
  expect(args.join(" ")).toContain("--base-model /kit/models/MERT-v2-FullSong")
  expect(args.at(-1)).toBe("--offline")
})

test("groupVocalSpans sorts notes and merges them at a breath gap", () => {
  const lab = ["4.500000\t5.000000\t64", "3.000000\t3.900000\t62", "3.400000\t3.800000\t60"].join(
    "\n",
  )

  expect(groupVocalSpans(lab, 10)).toEqual([
    { startSeconds: 3, endSeconds: 3.9 },
    { startSeconds: 4.5, endSeconds: 5 },
  ])
})

test("groupVocalSpans clamps spans to the duration and drops empty ones", () => {
  const lab = ["7.000000\t11.000000\t60", "11.500000\t13.000000\t62"].join("\n")

  expect(groupVocalSpans(lab, 10)).toEqual([{ startSeconds: 7, endSeconds: 10 }])
})

test("groupVocalSpans ignores blank and malformed lines", () => {
  const lab = ["", "not a note", "1.000000\t1.400000\t60", "2.000000\tbad\tx", "  "].join("\n")

  expect(groupVocalSpans(lab, 10)).toEqual([{ startSeconds: 1, endSeconds: 1.4 }])
})

test("successful vocal transcription returns the grouped spans", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runner = makeFakeRunner(async (outputDir) => {
      await mkdir(outputDir, { recursive: true })
      await writeFile(
        join(outputDir, "melody_vocal.lab"),
        "1.000000\t2.000000\t60\n4.000000\t5.000000\t62\n",
        "utf8",
      )
      return 0
    })
    const runVocalTranscribe = makeRunVocalTranscribe(env, runner)

    const result = await runVocalTranscribe({
      audioPath,
      outputDir: outputRoot,
      durationSeconds: 10,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.spans).toEqual([
      { startSeconds: 1, endSeconds: 2 },
      { startSeconds: 4, endSeconds: 5 },
    ])
  })
})

test("a vocal run without melody_vocal.lab is a failure", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runner = makeFakeRunner(async (outputDir) => {
      await mkdir(outputDir, { recursive: true })
      return 0
    })
    const runVocalTranscribe = makeRunVocalTranscribe(env, runner)

    const result = await runVocalTranscribe({
      audioPath,
      outputDir: outputRoot,
      durationSeconds: 10,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("vocal_transcribe_failed")
    expect(result.error.detail).toContain("melody_vocal.lab")
  })
})

test("a failed vocal run reports the stderr tail", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runVocalTranscribe = makeRunVocalTranscribe(
      env,
      makeFakeRunner(() => 2),
    )

    const result = await runVocalTranscribe({
      audioPath,
      outputDir: outputRoot,
      durationSeconds: 10,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("vocal_transcribe_failed")
    expect(result.error.detail).toContain("no module")
  })
})

test("a missing audio file fails the vocal run before spawning", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-transcribe-test-"))
  try {
    const spawns: string[] = []
    const runner: ProcessRunner = async (command) => {
      spawns.push(command[2] ?? "")
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const runVocalTranscribe = makeRunVocalTranscribe(env, runner)

    const result = await runVocalTranscribe({
      audioPath: join(outputRoot, "missing.flac"),
      outputDir: outputRoot,
      durationSeconds: 10,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.detail).toContain("audio is missing")
    expect(spawns).toEqual([])
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
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
