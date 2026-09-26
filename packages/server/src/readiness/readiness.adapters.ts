import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { MeasureModelSize, MeasurePathSize, PathExists } from "./readiness.ports"

/** One stat, no recursion: the cheap part of a readiness poll. */
export const makePathExists = (): PathExists => async (path) => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * A model directory holds one nested weight tree; a churning subtree (an
 * active download, a file removed mid-walk) contributes zero rather than
 * failing the whole measurement.
 */
const sumDirectoryBytes = async (path: string): Promise<number> => {
  const entries = await readdir(path, { withFileTypes: true })
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      try {
        const child = join(path, entry.name)
        if (entry.isDirectory()) return await sumDirectoryBytes(child)
        return (await stat(child)).size
      } catch {
        return 0
      }
    }),
  )
  return sizes.reduce((total, size) => total + size, 0)
}

/** Bytes under a path that exists. The walk never reads file contents. */
export const makeMeasurePathSize = (): MeasurePathSize => async (path) => {
  const stats = await stat(path)
  return stats.isDirectory() ? await sumDirectoryBytes(path) : stats.size
}

export type CachedModelSizeDeps = Readonly<{
  pathExists: PathExists
  measurePathSize: MeasurePathSize
  ttlMs: number
  now: () => number
}>

/**
 * Existence is live, so a download flips a model to ready on the next poll.
 * Only the byte size of a present path is cached; a path that disappears, or
 * one that cannot be measured, clears the entry and reports missing.
 */
export const makeCachedModelSize = (deps: CachedModelSizeDeps): MeasureModelSize => {
  const sizes = new Map<string, Readonly<{ size: number; at: number }>>()
  return async (path) => {
    if (!(await deps.pathExists(path))) {
      sizes.delete(path)
      return null
    }
    const cached = sizes.get(path)
    const now = deps.now()
    if (cached !== undefined && now - cached.at < deps.ttlMs) return cached.size
    try {
      const size = await deps.measurePathSize(path)
      sizes.set(path, { size, at: deps.now() })
      return size
    } catch {
      sizes.delete(path)
      return null
    }
  }
}

export type CacheOptions = Readonly<{ ttlMs: number; now: () => number }>

/**
 * A no-argument cache for the two system probes. nvidia-smi and ffmpeg each
 * cost a process spawn, so a poll inside the TTL reuses the last answer.
 */
export const makeCachedProbe = <T>(
  probe: () => Promise<T>,
  options: CacheOptions,
): (() => Promise<T>) => {
  // The Map is a one-slot cell, so the binding itself stays const.
  const cache = new Map<null, Readonly<{ value: T; at: number }>>()
  return async () => {
    const now = options.now()
    const cached = cache.get(null)
    if (cached !== undefined && now - cached.at < options.ttlMs) return cached.value
    const value = await probe()
    cache.set(null, { value, at: options.now() })
    return value
  }
}
