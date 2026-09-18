import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProcessRunner } from "../shared/process"
import {
  makeRunTranscribe,
  safeReferenceFilename,
  Sheetsage2AdapterEnv,
  transcribeArgs,
} from "./songs.sheetsage2.adapters"

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

test("safeReferenceFilename strips directories and control characters", () => {
  expect(safeReferenceFilename("../../etc/passwd")).toBe("passwd")
  expect(safeReferenceFilename("..\\..\\demo.mp3")).toBe("demo.mp3")
  expect(safeReferenceFilename("my song (demo).mp3")).toBe("my song (demo).mp3")
  expect(safeReferenceFilename("bad\u0000name.mp3")).toBe("badname.mp3")
  expect(safeReferenceFilename("   ")).toBe("reference")
  expect(safeReferenceFilename(".")).toBe("reference")
})

const makeFakeRunner =
  (behavior: (outputDir: string) => Promise<number> | number): ProcessRunner =>
  async (command) => {
    const outputIndex = command.indexOf("--output")
    const outputDir = command[outputIndex + 1] ?? ""
    const exitCode = await behavior(outputDir)
    return { exitCode, stdout: "", stderrTail: exitCode === 0 ? "" : "traceback: no module" }
  }

test("successful transcription returns the score ABC", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-transcribe-test-"))
  try {
    const runner = makeFakeRunner(async (outputDir) => {
      await mkdir(outputDir, { recursive: true })
      await writeFile(join(outputDir, "score.abc"), "X:1\nK:C\nC D E|", "utf8")
      return 0
    })
    const runTranscribe = makeRunTranscribe(env, runner)

    const result = await runTranscribe({
      audio: new Uint8Array([1, 2, 3]),
      filename: "demo.mp3",
      outputDir: outputRoot,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.scoreAbc).toBe("X:1\nK:C\nC D E|")
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test("a non-zero exit is a transcribe failure with the stderr tail", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-transcribe-test-"))
  try {
    const runTranscribe = makeRunTranscribe(
      env,
      makeFakeRunner(() => 1),
    )

    const result = await runTranscribe({
      audio: new Uint8Array([1, 2, 3]),
      filename: "demo.mp3",
      outputDir: outputRoot,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("transcribe_failed")
    expect(result.error.detail).toContain("no module")
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test("a run without score.abc is a transcribe failure", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-transcribe-test-"))
  try {
    const runTranscribe = makeRunTranscribe(
      env,
      makeFakeRunner(() => 0),
    )

    const result = await runTranscribe({
      audio: new Uint8Array([1, 2, 3]),
      filename: "demo.mp3",
      outputDir: outputRoot,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.detail).toContain("score.abc")
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test("a missing sheetsage2 environment fails before spawning", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-transcribe-test-"))
  try {
    let spawned = false
    const runner: ProcessRunner = async () => {
      spawned = true
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const runTranscribe = makeRunTranscribe({ ...env, pythonBin: "/kit/nope/python" }, runner)

    const result = await runTranscribe({
      audio: new Uint8Array([1, 2, 3]),
      filename: "demo.mp3",
      outputDir: outputRoot,
    })

    expect(result.ok).toBe(false)
    expect(spawned).toBe(false)
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})
