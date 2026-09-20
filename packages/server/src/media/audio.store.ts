import {
  FileHandle,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"
import { AudioStore } from "../songs/songs.ports"

const fillFrom = async (
  handle: FileHandle,
  buffer: Buffer,
  filled: number,
  start: number,
): Promise<boolean> => {
  if (filled === buffer.byteLength) return true
  const { bytesRead } = await handle.read(
    buffer,
    filled,
    buffer.byteLength - filled,
    start + filled,
  )
  if (bytesRead === 0) return false
  return fillFrom(handle, buffer, filled + bytesRead, start)
}

export const makeFsAudioStore = (mediaDir: string): AudioStore => {
  const pathOf = (key: string): string => join(mediaDir, key)

  return {
    put: async (key, audio) => {
      const path = pathOf(key)
      await mkdir(dirname(path), { recursive: true })
      const tempPath = `${path}.tmp`
      try {
        await writeFile(tempPath, audio)
        await rename(tempPath, path)
      } catch (error: unknown) {
        await rm(tempPath, { force: true })
        throw error
      }
      return Object.freeze({ path, byteLength: audio.byteLength })
    },

    stat: async (key) => {
      const path = pathOf(key)
      const info = await stat(path).catch(() => null)
      if (info === null || !info.isFile()) return null
      return Object.freeze({ path, byteLength: info.size })
    },

    read: async (key) => {
      const bytes = await readFile(pathOf(key)).catch(() => null)
      return bytes === null ? null : new Uint8Array(bytes)
    },

    openRange: async (key, start, end) => {
      const handle = await open(pathOf(key), "r").catch(() => null)
      if (handle === null) return null
      try {
        const buffer = Buffer.alloc(end - start + 1)
        const complete = await fillFrom(handle, buffer, 0, start)
        return complete ? new Uint8Array(buffer) : null
      } finally {
        await handle.close()
      }
    },

    remove: async (key) => {
      await rm(pathOf(key), { force: true })
    },

    list: async (): Promise<readonly string[]> => {
      const listDirectory = async (relativeDir: string): Promise<readonly string[]> => {
        const entries = await readdir(join(mediaDir, relativeDir), { withFileTypes: true }).catch(
          () => [],
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
