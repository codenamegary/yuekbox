import { isAbsolute, relative, resolve } from "node:path"
import { homeLayout } from "../shared/home"
import { ModelDownloadKey } from "./models.models"

/** `<home>/models`: the only tree a model download may write under. */
export const modelsRoot = (home: string): string => homeLayout(home).models

/** Where an in-flight download stages before it is moved into place. */
export const downloadTempRoot = (home: string): string => resolve(modelsRoot(home), ".downloads")

export const downloadTempDir = (home: string, key: ModelDownloadKey): string =>
  resolve(downloadTempRoot(home), key)

/** True when `candidate` is `root` or sits anywhere under it. */
const isUnderOrEqual = (root: string, candidate: string): boolean => {
  const path = relative(resolve(root), resolve(candidate))
  return !path.startsWith("..") && !isAbsolute(path)
}

/**
 * True when `target` sits under `<home>/models` but never in the staging
 * tree. The resolved config path is the only place a download could go, and
 * a path the user configured outside this tree is never written to; the
 * prompt steers to choosing a folder. The models root itself is not a model,
 * and a path inside `<home>/models/.downloads` would report a half-finished
 * download as ready.
 */
export const isInsideModelsDir = (home: string, target: string): boolean =>
  isUnderOrEqual(modelsRoot(home), target) &&
  !isUnderOrEqual(downloadTempRoot(home), target) &&
  resolve(target) !== resolve(modelsRoot(home))
