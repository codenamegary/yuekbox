import { isAbsolute, relative, resolve } from "node:path"
import { homeLayout } from "../shared/home"
import { ModelDownloadKey } from "./models.models"

/** `<home>/models`: the only tree a model download may write under. */
export const modelsRoot = (home: string): string => homeLayout(home).models

/** Where an in-flight download stages before it is moved into place. */
export const downloadTempRoot = (home: string): string => resolve(modelsRoot(home), ".downloads")

export const downloadTempDir = (home: string, key: ModelDownloadKey): string =>
  resolve(downloadTempRoot(home), key)

/**
 * True when `target` sits under `<home>/models`. The resolved config path is
 * the only place a download could go, and a path the user configured outside
 * this tree is never written to; the prompt steers to choosing a folder. The
 * models root itself is not a model.
 */
export const isInsideModelsDir = (home: string, target: string): boolean => {
  const root = resolve(modelsRoot(home))
  const candidate = resolve(target)
  const path = relative(root, candidate)
  return path !== "" && !path.startsWith("..") && !isAbsolute(path)
}
