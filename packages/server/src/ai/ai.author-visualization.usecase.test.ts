import { describe, expect, test } from "bun:test"
import { err, ok } from "../shared/result"
import { StoredConfig, StoredSetting } from "./ai.models"
import { ChatCompletion } from "./ai.ports"
import { makeAuthorVisualization } from "./ai.author-visualization.usecase"

const setting = (model: string): StoredSetting => ({
  presetId: "custom",
  baseUrl: "http://127.0.0.1:9/v1",
  apiKey: null,
  model,
  effort: "medium",
})

const storedConfig = (overrides: Partial<StoredConfig> = {}): StoredConfig => ({
  enabled: true,
  style: setting("style-model"),
  lyrics: setting("lyrics-model"),
  visuals: setting("visuals-model"),
  ...overrides,
})

const code =
  "(host) => ({ resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} })"

const input = { style: "neon ambient", lyrics: "[Verse]\nslow tide" }

const makeUseCase = (chat: ChatCompletion, config: StoredConfig = storedConfig()) =>
  makeAuthorVisualization({ loadStoredConfig: async () => config, chat })

describe("makeAuthorVisualization", () => {
  test("returns the model's code for the visuals writer", async () => {
    const seen: Array<{ model: string; user: string }> = []
    const author = makeUseCase(async (writer, _system, user) => {
      seen.push({ model: writer.model, user })
      return ok(code)
    })

    const result = await author(input)

    expect(result).toEqual(ok({ code }))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.model).toBe("visuals-model")
    expect(seen[0]?.user).toContain("neon ambient")
  })

  test("strips markdown fences the model wraps around the function", async () => {
    const author = makeUseCase(async () => ok(`\`\`\`javascript\n${code}\n\`\`\``))

    const result = await author(input)

    expect(result).toEqual(ok({ code }))
  })

  test("retries an upstream failure and returns the next reply", async () => {
    const calls: number[] = []
    const author = makeUseCase(async () => {
      calls.push(1)
      return calls.length === 1 ? err({ kind: "upstream", detail: "connection refused" }) : ok(code)
    })

    const result = await author(input)

    expect(result).toEqual(ok({ code }))
    expect(calls).toHaveLength(2)
  })

  test("retries an empty reply and returns the next code", async () => {
    const calls: number[] = []
    const author = makeUseCase(async () => {
      calls.push(1)
      return calls.length === 1 ? ok("   ") : ok(code)
    })

    const result = await author(input)

    expect(result).toEqual(ok({ code }))
    expect(calls).toHaveLength(2)
  })

  test("gives up after five retries and reports the blank replies", async () => {
    const calls: number[] = []
    const author = makeUseCase(async () => {
      calls.push(1)
      return ok("")
    })

    const result = await author(input)

    expect(result).toEqual(
      err({ kind: "unusable_result", detail: "the model replied with nothing" }),
    )
    expect(calls).toHaveLength(6)
  })

  test("unwraps an assigned factory before returning it", async () => {
    const author = makeUseCase(async () => ok(`const factory = ${code}`))

    expect(await author(input)).toEqual(ok({ code }))
  })

  test("retries a reply that throws when drawn and returns the next one", async () => {
    const calls: number[] = []
    const broken = `(host) => { Math.seedrandom(1); return { resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} } }`
    const author = makeUseCase(async () => {
      calls.push(1)
      return calls.length === 1 ? ok(broken) : ok(code)
    })

    const result = await author(input)

    expect(result).toEqual(ok({ code }))
    expect(calls).toHaveLength(2)
  })

  test("gives up and reports why the code could not run", async () => {
    const calls: number[] = []
    const broken = `(host) => { Math.seedrandom(1); return { resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} } }`
    const author = makeUseCase(async () => {
      calls.push(1)
      return ok(broken)
    })

    const result = await author(input)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("unusable_result")
    expect(result.error.detail).toContain("seedrandom")
    expect(calls).toHaveLength(6)
  })

  test("picks the visuals scope's model before spending a call", async () => {
    const calls: number[] = []
    const author = makeUseCase(
      async () => {
        calls.push(1)
        return ok(code)
      },
      storedConfig({ visuals: setting("") }),
    )

    const result = await author(input)

    expect(result).toEqual(
      err({ kind: "not_configured", detail: "Pick a model in AI settings first." }),
    )
    expect(calls).toHaveLength(0)
  })

  test("never calls the model while AI is disabled", async () => {
    const calls: number[] = []
    const author = makeUseCase(
      async () => {
        calls.push(1)
        return ok(code)
      },
      storedConfig({ enabled: false }),
    )

    const result = await author(input)

    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  test("asks for canvas code, not songwriting", async () => {
    const systems: string[] = []
    const author = makeUseCase(async (_writer, system) => {
      systems.push(system)
      return ok(code)
    })

    await author(input)

    expect(systems[0]).toContain("canvas")
  })
})
