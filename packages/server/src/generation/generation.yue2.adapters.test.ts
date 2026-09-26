import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ModelPaths } from "contracts/http/config"
import { ProcessRunner } from "../shared/process"
import {
  checkYue2,
  generateArgs,
  makeRunYue2Generate,
  parseYue2Line,
  Yue2ArgsEnv,
  Yue2CheckEnv,
} from "./generation.yue2.adapters"

test("parses a numeric synthesizing line", () => {
  expect(
    parseYue2Line("[YuE2] Running Synthesizing audio: 12/40 steps (30%) | elapsed 5.1s"),
  ).toEqual({ kind: "progress", stage: "synthesize", completed: 12, total: 40 })
})

test("parses a starting decode line with an upfront total", () => {
  expect(parseYue2Line("[YuE2] Starting Decoding audio: 0/8 chunks (0%) | elapsed 0.0s")).toEqual({
    kind: "progress",
    stage: "decode",
    completed: 0,
    total: 8,
  })
})

test("parses a completion line with a total", () => {
  expect(
    parseYue2Line("[YuE2] Completed Decoding audio: 8/8 chunks (100%) | elapsed 4.2s"),
  ).toEqual({ kind: "progress", stage: "decode", completed: 8, total: 8 })
})

test("token lines report the stage without progress", () => {
  expect(
    parseYue2Line("[YuE2] Running Generating song: 1234 tokens | 62.3 tokens/s | elapsed 19.8s"),
  ).toEqual({ kind: "stage", stage: "semantic" })
  expect(
    parseYue2Line("[YuE2] Starting Planning score: 0 tokens | 0.0 tokens/s | elapsed 0.0s"),
  ).toEqual({ kind: "stage", stage: "plan" })
})

test("clamps a count that exceeds its advertised total", () => {
  expect(parseYue2Line("[YuE2] Running Decoding audio: 9/8 chunks (112%) | elapsed 4s")).toEqual({
    kind: "progress",
    stage: "decode",
    completed: 8,
    total: 8,
  })
})

test("summary and unrelated lines are ignored", () => {
  expect(parseYue2Line("[YuE2] Completed: 74.4s audio in 123.4s")).toBeNull()
  expect(parseYue2Line("[YuE2] Running Loading model: elapsed 61.9s")).toBeNull()
  expect(parseYue2Line("Loading model")).toBeNull()
  expect(parseYue2Line("")).toBeNull()
})

const modelPaths: ModelPaths = Object.freeze({
  yue2: "/models/YuE2-3B",
  yue2Vae: "/models/YuE2-Vae",
  sheetsage2: "/models/SheetSage2",
  sheetsage2Base: "/models/MERT-v2-FullSong",
  whisper: "/models/whisper-large-v3-turbo",
})

const env: Yue2ArgsEnv = {
  pythonBin: process.execPath,
  scriptPath: import.meta.path,
  model: modelPaths.yue2,
  vae: modelPaths.yue2Vae,
  gpuBudget: 16,
}

test("generate args call our script with the resolved model and vae, not a kit", () => {
  const args = generateArgs(
    env,
    {
      songId: "song-1",
      lyrics: "hello",
      style: "pop",
      seed: 7,
      cot: "full",
      abc: null,
      outputDir: "/tmp/output",
      onStage: () => {},
      onProgress: () => {},
    },
    "/tmp/output/request.json",
  )

  expect(args).toEqual([
    env.pythonBin,
    env.scriptPath,
    "--request",
    "/tmp/output/request.json",
    "--output",
    join("/tmp/output", "out"),
    "--model",
    "/models/YuE2-3B",
    "--vae",
    "/models/YuE2-Vae",
    "--budget",
    "16",
    "--offline",
    "--device",
    "cuda",
  ])
})

test("checkYue2 needs the python, the script, the model, and the vae", () => {
  const ready: Yue2CheckEnv = {
    pythonBin: process.execPath,
    scriptPath: import.meta.path,
    model: import.meta.path,
    vae: process.execPath,
  }

  expect(checkYue2(ready)).toBe("ok")
  expect(checkYue2({ ...ready, scriptPath: "/nope" })).toBe("missing")
  expect(checkYue2({ ...ready, pythonBin: "/nope" })).toBe("missing")
  expect(checkYue2({ ...ready, model: "/nope" })).toBe("missing")
  expect(checkYue2({ ...ready, vae: "/nope" })).toBe("missing")
})

test("the model and vae are resolved when the run starts, not at construction", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "yuekbox-yue2-args-test-"))
  try {
    const commands: string[][] = []
    const run: ProcessRunner = async (command) => {
      commands.push([...command])
      return { exitCode: 1, stdout: "", stderrTail: "stop here" }
    }
    const paths: { value: ModelPaths } = {
      value: {
        ...modelPaths,
        yue2: "/boot/YuE2-3B",
        yue2Vae: "/boot/YuE2-Vae",
      },
    }
    const generate = makeRunYue2Generate(
      {
        pythonBin: process.execPath,
        scriptPath: import.meta.path,
        gpuBudget: 16,
        cwd: "/tmp",
        readModelPaths: async () => paths.value,
      },
      run,
    )

    paths.value = {
      ...paths.value,
      yue2: "/mnt/audio/YuE2-3B",
      yue2Vae: "/mnt/audio/YuE2-Vae",
    }
    const result = await generate({
      songId: "song-1",
      lyrics: "hello",
      style: "pop",
      seed: 7,
      cot: "full",
      abc: null,
      outputDir,
      onStage: () => {},
      onProgress: () => {},
    })

    expect(result.ok).toBe(false)
    const command = commands[0] ?? []
    expect(command[command.indexOf("--model") + 1]).toBe("/mnt/audio/YuE2-3B")
    expect(command[command.indexOf("--vae") + 1]).toBe("/mnt/audio/YuE2-Vae")
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})
