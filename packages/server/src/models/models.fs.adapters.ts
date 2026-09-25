import { mkdir, rename, rm, stat } from "node:fs/promises"
import {
  EnsureDirectory,
  MeasureFileBytes,
  MoveDirectory,
  PathExists,
  RemoveDirectory,
} from "./models.ports"

export const makePathExists = (): PathExists => async (path) => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export const makeEnsureDirectory = (): EnsureDirectory => async (path) => {
  await mkdir(path, { recursive: true })
}

export const makeMoveDirectory = (): MoveDirectory => async (from, to) => {
  await rename(from, to)
}

/** For our own staging folder; never called on a user-supplied model path. */
export const makeRemoveDirectory = (): RemoveDirectory => async (path) => {
  await rm(path, { recursive: true, force: true })
}

export const makeMeasureFileBytes = (): MeasureFileBytes => async (path) => {
  try {
    const stats = await stat(path)
    return stats.isFile() ? stats.size : null
  } catch {
    return null
  }
}
