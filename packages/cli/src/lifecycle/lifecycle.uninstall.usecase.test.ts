import { expect, test } from "bun:test"
import { dataBuckets, homeBuckets } from "./lifecycle.paths"
import { makeUninstall, UninstallDeps } from "./lifecycle.uninstall.usecase"

type Answers = readonly boolean[]

const home = "/home/you/.yuekbox"
const execPath = "/home/you/.local/bin/yuekbox"
const buckets = homeBuckets(home)

const harness = (options: {
  tty?: boolean
  modelsEntries?: readonly string[]
  answers?: Answers
  failRemoving?: string
  standalone?: boolean
}) => {
  const lines: string[] = []
  const calls = {
    prompts: [] as string[],
    stopped: 0,
    removed: [] as string[],
  }

  const deps: UninstallDeps = {
    stdinIsTty: () => options.tty !== false,
    prompt: async (question) => {
      calls.prompts.push(question)
      const answer = options.answers?.[calls.prompts.length - 1]
      if (answer === undefined) throw new Error(`unexpected prompt: ${question}`)
      return answer
    },
    listEntries: async (path) => (path === buckets.models ? (options.modelsEntries ?? []) : []),
    removePath: async (path) => {
      if (options.failRemoving !== undefined && path === options.failRemoving) {
        throw new Error("permission denied")
      }
      calls.removed.push(path)
    },
    stop: async () => {
      calls.stopped += 1
      return 0
    },
    out: (line) => lines.push(line),
  }
  return { deps, lines, calls }
}

const input = (overrides: { purge?: boolean; standalone?: boolean } = {}) => ({
  home,
  lockPath: `${home}/run/yuekbox.lock`,
  statePath: `${home}/run/yuekbox.json`,
  execPath,
  standalone: overrides.standalone ?? true,
  purge: overrides.purge ?? false,
})

test("answering no to everything removes nothing and prints `nothing removed`", async () => {
  const h = harness({
    modelsEntries: ["YuE2-3B"],
    answers: [false, false, false],
  })

  const exitCode = await makeUninstall(h.deps)(input())

  expect(exitCode).toBe(0)
  expect(h.calls.stopped).toBe(0)
  expect(h.calls.removed).toEqual([])
  expect(h.lines).toEqual(["nothing removed"])
})

test("yes to the binary only removes the executable, after stopping the server", async () => {
  const h = harness({ answers: [true, false] })

  const exitCode = await makeUninstall(h.deps)(input())

  expect(exitCode).toBe(0)
  expect(h.calls.stopped).toBe(1)
  expect(h.calls.removed).toEqual([execPath])
  expect(h.lines).toEqual([`removed ${execPath}`])
})

test("yes to app data removes every bucket except the models", async () => {
  const h = harness({ answers: [false, true] })

  const exitCode = await makeUninstall(h.deps)(input())

  expect(exitCode).toBe(0)
  expect(h.calls.removed).toEqual([...dataBuckets(home)])
  expect(h.calls.removed).not.toContain(buckets.models)
  expect(h.calls.removed).not.toContain(home)
})

test("the models prompt only appears when the models folder has something in it", async () => {
  const h = harness({ answers: [false, false] })

  await makeUninstall(h.deps)(input())

  expect(h.calls.prompts).toHaveLength(2)
  expect(h.calls.prompts[0]).toBe(`Remove the yuekbox executable at ${execPath}?`)
  expect(h.calls.prompts[1]).toBe(
    `Remove app data at ${home} (config, runtime, scripts, songs, database)?`,
  )

  const withModels = harness({ modelsEntries: ["YuE2-3B"], answers: [false, false, true] })
  await makeUninstall(withModels.deps)(input())
  expect(withModels.calls.prompts).toHaveLength(3)
  expect(withModels.calls.prompts[2]).toBe(`Remove downloaded models at ${buckets.models}?`)
  expect(withModels.calls.removed).toEqual([buckets.models])
})

test("--purge removes the whole home and the binary with no prompts", async () => {
  const h = harness({ failRemoving: "never" })

  const exitCode = await makeUninstall(h.deps)(input({ purge: true }))

  expect(exitCode).toBe(0)
  expect(h.calls.prompts).toEqual([])
  expect(h.calls.stopped).toBe(1)
  expect(h.calls.removed).toEqual([home, execPath])
  expect(h.lines).toEqual([`removed ${home}`, `removed ${execPath}`])
})

test("--purge on a dev runtime (not a packaged binary) removes the home only", async () => {
  const h = harness({})

  const exitCode = await makeUninstall(h.deps)(input({ purge: true, standalone: false }))

  expect(exitCode).toBe(0)
  expect(h.calls.removed).toEqual([home])
})

test("no TTY without --purge refuses with exit 1", async () => {
  const h = harness({ tty: false })

  const exitCode = await makeUninstall(h.deps)(input())

  expect(exitCode).toBe(1)
  expect(h.calls.prompts).toEqual([])
  expect(h.calls.stopped).toBe(0)
  expect(h.calls.removed).toEqual([])
  expect(h.lines[0]).toContain("--purge")
})

test("a failed deletion reports the path and exits 1", async () => {
  const h = harness({ answers: [true, false], failRemoving: execPath })

  const exitCode = await makeUninstall(h.deps)(input())

  expect(exitCode).toBe(1)
  expect(h.lines).toEqual([`could not remove ${execPath}`])
})

test("purge models plus data collapses to removing the home once", async () => {
  const h = harness({ modelsEntries: ["YuE2-3B"], answers: [true, true, true] })

  const exitCode = await makeUninstall(h.deps)(input())

  expect(exitCode).toBe(0)
  expect(h.calls.removed).toEqual([home, execPath])
})
