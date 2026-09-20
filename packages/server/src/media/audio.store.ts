import { mkdir, readdir, rename, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { AudioStore, StoredAudio } from "../songs/songs.ports"

const isMissingFile = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"

export const makeFsAudioStore = (mediaDir: string): AudioStore => {
  const root = resolve(mediaDir)
  const pathOf = (key: string): string => join(root, key)

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

  return {
    path: pathOf,

    put: async (key, audio) => {
      const path = pathOf(key)
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
    },

    stat: (key) => statOrNull(pathOf(key)),

    read: async (key) => {
      try {
        return new Uint8Array(await Bun.file(pathOf(key)).arrayBuffer())
      } catch (error: unknown) {
        if (isMissingFile(error)) return null
        throw error
      }
    },

    openRange: async (key, start, end) => {
      const path = pathOf(key)
      const info = await statOrNull(path)
      if (info === null || info.byteLength < end + 1) return null
      const bytes = await Bun.file(path)
        .slice(start, end + 1)
        .arrayBuffer()
      return new Uint8Array(bytes)
    },

    move: async (fromKey, toKey) => {
      await mkdir(dirname(pathOf(toKey)), { recursive: true })
      await rename(pathOf(fromKey), pathOf(toKey))
    },

    remove: async (key) => {
      await rm(pathOf(key), { force: true })
    },

    list: async (): Promise<readonly string[]> => {
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
    },
  }
}
