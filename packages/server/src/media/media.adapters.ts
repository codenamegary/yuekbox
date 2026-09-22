import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import {
  CopyDirectory,
  FindFiles,
  MakeDirectory,
  MoveFile,
  OpenFileRange,
  PutFile,
  ReadFile,
  RemoveDirectory,
  RemoveFile,
  StatFile,
  StoredFile,
} from "./media.ports"

const isMissingFile = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"

const statOrNull = async (path: string): Promise<StoredFile | null> => {
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    return Object.freeze({ path, byteLength: info.size })
  } catch (error: unknown) {
    if (isMissingFile(error)) return null
    throw error
  }
}

export const makeMakeDirectory = (mediaDir: string): MakeDirectory => {
  const root = resolve(mediaDir)
  return async (key) => {
    await mkdir(join(root, key), { recursive: true })
  }
}

export const makePutFile = (mediaDir: string): PutFile => {
  const root = resolve(mediaDir)
  return async (key, bytes) => {
    const path = join(root, key)
    await mkdir(dirname(path), { recursive: true })
    const tempPath = `${path}.tmp`
    try {
      await Bun.write(tempPath, bytes)
      await rename(tempPath, path)
    } catch (error: unknown) {
      await rm(tempPath, { force: true })
      throw error
    }
    return bytes.byteLength
  }
}

export const makeStatFile = (mediaDir: string): StatFile => {
  const root = resolve(mediaDir)
  return (key) => statOrNull(join(root, key))
}

export const makeReadFile = (mediaDir: string): ReadFile => {
  const root = resolve(mediaDir)
  return async (key) => {
    try {
      return new Uint8Array(await Bun.file(join(root, key)).arrayBuffer())
    } catch (error: unknown) {
      if (isMissingFile(error)) return null
      throw error
    }
  }
}

export const makeOpenFileRange = (mediaDir: string): OpenFileRange => {
  const root = resolve(mediaDir)
  return async (key, start, end) => {
    const path = join(root, key)
    const info = await statOrNull(path)
    if (info === null || info.byteLength < end + 1) return null
    const bytes = await Bun.file(path)
      .slice(start, end + 1)
      .arrayBuffer()
    return new Uint8Array(bytes)
  }
}

export const makeMoveFile = (mediaDir: string): MoveFile => {
  const root = resolve(mediaDir)
  return async (fromKey, toKey) => {
    const toPath = join(root, toKey)
    await mkdir(dirname(toPath), { recursive: true })
    await rename(join(root, fromKey), toPath)
  }
}

export const makeRemoveFile = (mediaDir: string): RemoveFile => {
  const root = resolve(mediaDir)
  return async (key) => {
    await rm(join(root, key), { force: true })
  }
}

export const makeRemoveDirectory = (mediaDir: string): RemoveDirectory => {
  const root = resolve(mediaDir)
  return async (key) => {
    await rm(join(root, key), { recursive: true, force: true })
  }
}

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const segmentMatcher = (segment: string): RegExp =>
  new RegExp(`^${segment.split("*").map(escapeForRegExp).join(".*")}$`)

const parsePattern = (pattern: string): readonly string[] | null => {
  if (pattern === "" || pattern.startsWith("/")) return null
  const segments = pattern.split("/")
  return segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ? null
    : segments
}

export const makeCopyDirectory = (mediaDir: string): CopyDirectory => {
  const root = resolve(mediaDir)
  return async (sourcePath, key) => {
    const target = join(root, key)
    await mkdir(dirname(target), { recursive: true })
    await cp(sourcePath, target, { recursive: true, force: true })
  }
}

export const makeFindFiles = (mediaDir: string): FindFiles => {
  const root = resolve(mediaDir)
  return async (pattern) => {
    const segments = parsePattern(pattern)
    if (segments === null) throw new Error(`invalid media pattern: ${pattern}`)
    const matchers = segments.map(segmentMatcher)

    const visit = async (prefix: string, index: number): Promise<readonly string[]> => {
      const matcher = matchers[index]
      if (matcher === undefined) return []
      const directory = prefix === "" ? root : join(root, prefix)
      const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
        if (isMissingFile(error)) return []
        throw error
      })

      const matches: string[] = []
      for (const entry of entries) {
        if (!matcher.test(entry.name)) continue
        const key = prefix === "" ? entry.name : `${prefix}/${entry.name}`
        if (index === matchers.length - 1) {
          matches.push(key)
        } else if (entry.isDirectory()) {
          matches.push(...(await visit(key, index + 1)))
        }
      }
      return matches
    }

    return Object.freeze((await visit("", 0)).toSorted())
  }
}
