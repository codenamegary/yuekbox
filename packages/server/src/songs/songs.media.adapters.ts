import { mkdir, readdir, rename, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import {
  AudioPath,
  ListMediaFiles,
  MoveAudio,
  OpenAudioRange,
  PutAudio,
  ReadAudio,
  RemoveAudio,
  StatAudio,
  StoredAudio,
} from "./songs.ports"

const isMissingFile = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"

const statOrNull = async (path: string): Promise<StoredAudio | null> => {
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    return Object.freeze({ path, byteLength: info.size })
  } catch (error: unknown) {
    if (isMissingFile(error)) return null
    throw error
  }
}

export const makeAudioPath = (mediaDir: string): AudioPath => {
  const root = resolve(mediaDir)
  return (key) => join(root, key)
}

export const makePutAudio = (mediaDir: string): PutAudio => {
  const root = resolve(mediaDir)
  return async (key, audio) => {
    const path = join(root, key)
    await mkdir(dirname(path), { recursive: true })
    const tempPath = `${path}.tmp`
    try {
      await Bun.write(tempPath, audio)
      await rename(tempPath, path)
    } catch (error: unknown) {
      await rm(tempPath, { force: true })
      throw error
    }
    return Object.freeze({ path, byteLength: audio.byteLength })
  }
}

export const makeStatAudio = (mediaDir: string): StatAudio => {
  const root = resolve(mediaDir)
  return (key) => statOrNull(join(root, key))
}

export const makeReadAudio = (mediaDir: string): ReadAudio => {
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

export const makeOpenAudioRange = (mediaDir: string): OpenAudioRange => {
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

export const makeMoveAudio = (mediaDir: string): MoveAudio => {
  const root = resolve(mediaDir)
  return async (fromKey, toKey) => {
    const toPath = join(root, toKey)
    await mkdir(dirname(toPath), { recursive: true })
    await rename(join(root, fromKey), toPath)
  }
}

export const makeRemoveAudio = (mediaDir: string): RemoveAudio => {
  const root = resolve(mediaDir)
  return async (key) => {
    await rm(join(root, key), { force: true })
  }
}

export const makeListMediaFiles = (mediaDir: string): ListMediaFiles => {
  const root = resolve(mediaDir)
  return async (): Promise<readonly string[]> => {
    const listDirectory = async (relativeDir: string): Promise<readonly string[]> => {
      const entries = await readdir(join(root, relativeDir), { withFileTypes: true }).catch(
        (error: unknown) => {
          if (isMissingFile(error)) return []
          throw error
        },
      )
      const nested = await Promise.all(
        entries.map(async (entry) => {
          const relativePath = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`
          if (entry.isDirectory()) return listDirectory(relativePath)
          return entry.isFile() ? [relativePath] : []
        }),
      )
      return nested.flat()
    }

    return Object.freeze(await listDirectory(""))
  }
}
