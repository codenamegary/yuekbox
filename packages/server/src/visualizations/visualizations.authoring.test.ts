import { describe, expect, test } from "bun:test"
import { VisualizationAuthorError } from "../ai/ai.models"
import { ok, Result } from "../shared/result"
import { songFixture } from "../songs/songs.fixtures"
import { makeVisualizationAuthoring } from "./visualizations.authoring"

const song = songFixture({ id: "01J8K3R4P9ABCDEFGHJKMNPQRS", style: "pop", lyrics: "hello" })
const code = "(host) => ({})"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe("makeVisualizationAuthoring", () => {
  test("authoring writes the code and stops being in flight", async () => {
    const written: Array<{ songId: string; code: string }> = []
    const authoring = makeVisualizationAuthoring({
      author: async () => ok({ code }),
      readAnalysis: async () => null,
      writeFile: async (songId, fileCode) => {
        written.push({ songId, code: fileCode })
        return fileCode.length
      },
    })

    authoring.start(song)
    expect(authoring.isInFlight(song.id)).toBe(true)

    await authoring.drain()

    expect(written).toEqual([{ songId: song.id, code }])
    expect(authoring.isInFlight(song.id)).toBe(false)
    expect(authoring.failureFor(song.id)).toBeNull()
  })

  test("an authoring failure is remembered with its detail", async () => {
    const authoring = makeVisualizationAuthoring({
      author: async () => ({ ok: false, error: { kind: "upstream_failed", detail: "503 down" } }),
      readAnalysis: async () => null,
      writeFile: async () => 0,
    })

    authoring.start(song)
    await authoring.drain()

    expect(authoring.failureFor(song.id)).toBe("503 down")
    expect(authoring.isInFlight(song.id)).toBe(false)
  })

  test("a file write failure is remembered too", async () => {
    const authoring = makeVisualizationAuthoring({
      author: async () => ok({ code }),
      readAnalysis: async () => null,
      writeFile: async () => {
        throw new Error("disk full")
      },
    })

    authoring.start(song)
    await authoring.drain()

    expect(authoring.failureFor(song.id)).toContain("disk full")
  })

  test("a second start while in flight changes nothing", async () => {
    const first = deferred<Result<Readonly<{ code: string }>, VisualizationAuthorError>>()
    let calls = 0
    const authoring = makeVisualizationAuthoring({
      author: () => {
        calls += 1
        return first.promise
      },
      readAnalysis: async () => null,
      writeFile: async () => 0,
    })

    authoring.start(song)
    authoring.start(song)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toBe(1)

    first.resolve(ok({ code }))
    await authoring.drain()
  })

  test("a reroll clears the remembered failure", async () => {
    let reply: "failed" | "ok" = "failed"
    const authoring = makeVisualizationAuthoring({
      author: async () =>
        reply === "failed"
          ? { ok: false, error: { kind: "upstream_failed", detail: "down" } }
          : ok({ code }),
      readAnalysis: async () => null,
      writeFile: async () => 0,
    })

    authoring.start(song)
    await authoring.drain()
    expect(authoring.failureFor(song.id)).toBe("down")

    reply = "ok"
    authoring.start(song)
    expect(authoring.failureFor(song.id)).toBeNull()
    await authoring.drain()
    expect(authoring.failureFor(song.id)).toBeNull()
  })

  test("a thrown author call is caught and reported", async () => {
    const errors: string[] = []
    const authoring = makeVisualizationAuthoring({
      author: async () => {
        throw new Error("socket exploded")
      },
      readAnalysis: async () => null,
      writeFile: async () => 0,
      logError: (message) => {
        errors.push(message)
      },
    })

    authoring.start(song)
    await authoring.drain()

    expect(authoring.failureFor(song.id)).toContain("socket exploded")
    expect(errors).toHaveLength(1)
  })
})
