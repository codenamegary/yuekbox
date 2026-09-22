import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { ProcessRunner } from "../shared/process"
import {
  LyricAlignAdapterEnv,
  lyricAlignArgs,
  makeRunLyricAlign,
} from "./generation.lyricalign.adapters"

const env: LyricAlignAdapterEnv = {
  pythonBin: process.execPath,
  scriptPath: import.meta.path,
  device: "cuda:0",
  cwd: "/kit",
}

test("lyric align args point the script at the audio and the calibration file", () => {
  const args = lyricAlignArgs(env, {
    audioPath: "/tmp/out/audio.flac",
    outputDir: "/tmp/out",
  })

  expect(args.slice(0, 2)).toEqual([env.pythonBin, env.scriptPath])
  expect(args.join(" ")).toContain("--audio /tmp/out/audio.flac")
  expect(args.join(" ")).toContain("--out /tmp/out/lyric-align")
  expect(args.join(" ")).toContain("--calibration-out /tmp/out/lyric-align/calibration.json")
  expect(args.join(" ")).toContain("--device cuda:0")
})

const calibrationFixture = {
  cues: [
    { text: "hello world", startSeconds: 1, endSeconds: 2 },
    { text: "second line", startSeconds: 2.5, endSeconds: 4 },
  ],
}

test("a successful run returns the parsed calibration", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runner = makeFakeRunner(async (calibrationPath) => {
      await mkdir(dirname(calibrationPath), { recursive: true })
      await writeFile(calibrationPath, JSON.stringify(calibrationFixture), "utf8")
      return 0
    })
    const runLyricAlign = makeRunLyricAlign(env, runner)

    const result = await runLyricAlign({ audioPath, outputDir: outputRoot })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.calibration).toEqual(calibrationFixture)
  })
})

test("a run without a calibration file is a failure", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runLyricAlign = makeRunLyricAlign(
      env,
      makeFakeRunner(async () => 0),
    )

    const result = await runLyricAlign({ audioPath, outputDir: outputRoot })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("lyric_align_failed")
    expect(result.error.detail).toContain("calibration.json")
  })
})

test("a calibration that violates the contract is a failure", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runner = makeFakeRunner(async (calibrationPath) => {
      await mkdir(dirname(calibrationPath), { recursive: true })
      await writeFile(calibrationPath, JSON.stringify({ cues: [] }), "utf8")
      return 0
    })
    const runLyricAlign = makeRunLyricAlign(env, runner)

    const result = await runLyricAlign({ audioPath, outputDir: outputRoot })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("lyric_align_failed")
    expect(result.error.detail).toContain("does not match the contract")
  })
})

test("a non-zero exit reports the stderr tail", async () => {
  await withStoredAudio(async (audioPath, outputRoot) => {
    const runLyricAlign = makeRunLyricAlign(
      env,
      makeFakeRunner(() => 2),
    )

    const result = await runLyricAlign({ audioPath, outputDir: outputRoot })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("lyric_align_failed")
    expect(result.error.detail).toContain("no module")
  })
})

test("a missing audio file fails before spawning", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-lyric-align-test-"))
  try {
    const spawns: string[] = []
    const runner: ProcessRunner = async (command) => {
      spawns.push(command[2] ?? "")
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const runLyricAlign = makeRunLyricAlign(env, runner)

    const result = await runLyricAlign({
      audioPath: join(outputRoot, "missing.flac"),
      outputDir: outputRoot,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.detail).toContain("audio is missing")
    expect(spawns).toEqual([])
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

test("a missing lyric align environment fails before spawning", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-lyric-align-test-"))
  try {
    const spawns: string[] = []
    const runner: ProcessRunner = async (command) => {
      spawns.push(command[2] ?? "")
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const runLyricAlign = makeRunLyricAlign({ ...env, pythonBin: "/kit/nope/python" }, runner)

    const result = await runLyricAlign({
      audioPath: join(outputRoot, "demo.flac"),
      outputDir: outputRoot,
    })

    expect(result.ok).toBe(false)
    expect(spawns).toEqual([])
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})

const makeFakeRunner =
  (behavior: (calibrationPath: string) => Promise<number> | number): ProcessRunner =>
  async (command) => {
    const calibrationIndex = command.indexOf("--calibration-out")
    const calibrationPath = command[calibrationIndex + 1] ?? ""
    const exitCode = await behavior(calibrationPath)
    return { exitCode, stdout: "", stderrTail: exitCode === 0 ? "" : "traceback: no module" }
  }

const withStoredAudio = async (
  run: (audioPath: string, outputRoot: string) => Promise<void>,
): Promise<void> => {
  const outputRoot = await mkdtemp(join(tmpdir(), "yuekbox-lyric-align-test-"))
  try {
    const audioPath = join(outputRoot, "demo.flac")
    await writeFile(audioPath, new Uint8Array([1, 2, 3]))
    await run(audioPath, outputRoot)
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
}
