import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  makeCachedModelSize,
  makeCachedProbe,
  makeMeasurePathSize,
  makePathExists,
} from "./readiness.adapters"

test("pathExists sees files and directories, and not a missing path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yuekbox-readiness-"))
  try {
    const file = join(dir, "model.safetensors")
    await writeFile(file, "12345")
    const pathExists = makePathExists()

    expect(await pathExists(dir)).toBe(true)
    expect(await pathExists(file)).toBe(true)
    expect(await pathExists(join(dir, "nope"))).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("measurePathSize sums files recursively", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yuekbox-readiness-"))
  try {
    await writeFile(join(dir, "model.safetensors"), "12345")
    await mkdir(join(dir, "nested"))
    await writeFile(join(dir, "nested", "weights.bin"), "123")
    const measurePathSize = makeMeasurePathSize()

    expect(await measurePathSize(dir)).toBe(8)
    expect(await measurePathSize(join(dir, "nested", "weights.bin"))).toBe(3)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

const cacheTtlMs = 60_000

test("a present path is measured once inside the size ttl", async () => {
  const measurements: number[] = []
  const clock: { ms: number } = { ms: 1_000 }
  const measureModelSize = makeCachedModelSize({
    pathExists: async () => true,
    measurePathSize: async () => {
      measurements.push(42)
      return 42
    },
    ttlMs: cacheTtlMs,
    now: () => clock.ms,
  })

  expect(await measureModelSize("/models/YuE2-3B")).toBe(42)
  clock.ms = 60_999
  expect(await measureModelSize("/models/YuE2-3B")).toBe(42)
  expect(measurements).toHaveLength(1)
  clock.ms = 61_000
  expect(await measureModelSize("/models/YuE2-3B")).toBe(42)
  expect(measurements).toHaveLength(2)
})

test("a missing path is checked live on every call and never measured", async () => {
  const checks: number[] = []
  const measureModelSize = makeCachedModelSize({
    pathExists: async () => {
      checks.push(1)
      return false
    },
    measurePathSize: async () => {
      throw new Error("a missing path must not be measured")
    },
    ttlMs: cacheTtlMs,
    now: () => 1_000,
  })

  expect(await measureModelSize("/models/YuE2-3B")).toBeNull()
  expect(await measureModelSize("/models/YuE2-3B")).toBeNull()
  expect(checks).toHaveLength(2)
})

test("a cached size is dropped when the path disappears and re-measured when it returns", async () => {
  const presence: { value: boolean } = { value: true }
  const measurements: number[] = []
  const measureModelSize = makeCachedModelSize({
    pathExists: async () => presence.value,
    measurePathSize: async () => {
      measurements.push(42)
      return 42
    },
    ttlMs: cacheTtlMs,
    now: () => 1_000,
  })

  expect(await measureModelSize("/models/YuE2-3B")).toBe(42)
  presence.value = false
  expect(await measureModelSize("/models/YuE2-3B")).toBeNull()
  presence.value = true
  expect(await measureModelSize("/models/YuE2-3B")).toBe(42)
  expect(measurements).toHaveLength(2)
})

test("a path that cannot be measured reports missing instead of throwing", async () => {
  const measureModelSize = makeCachedModelSize({
    pathExists: async () => true,
    measurePathSize: async () => {
      throw new Error("permission denied")
    },
    ttlMs: cacheTtlMs,
    now: () => 1_000,
  })

  expect(await measureModelSize("/models/YuE2-3B")).toBeNull()
})

test("a cached probe reuses its value until the ttl", async () => {
  const calls: number[] = []
  const clock: { ms: number } = { ms: 0 }
  const probe = makeCachedProbe(
    async () => {
      calls.push(calls.length + 1)
      return calls.length
    },
    { ttlMs: 30_000, now: () => clock.ms },
  )

  expect(await probe()).toBe(1)
  clock.ms = 29_999
  expect(await probe()).toBe(1)
  clock.ms = 30_000
  expect(await probe()).toBe(2)
  expect(calls).toHaveLength(2)
})
