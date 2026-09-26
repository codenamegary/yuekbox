import { isAbsolute, join, resolve } from "node:path"
import { ModelPathOverrides, ModelPaths } from "contracts/http/config"
import { homeLayout, modelDirectoryNames } from "../shared/home"

/** `<home>/models/<name>` for each of the five user-configurable models. */
export const defaultModelPaths = (home: string): ModelPaths => {
  const models = homeLayout(home).models
  return Object.freeze({
    yue2: join(models, modelDirectoryNames.yue2),
    yue2Vae: join(models, modelDirectoryNames.yue2Vae),
    sheetsage2: join(models, modelDirectoryNames.sheetsage2),
    sheetsage2Base: join(models, modelDirectoryNames.sheetsage2Base),
    whisper: join(models, modelDirectoryNames.whisper),
  })
}

export type ResolveModelPathsInput = Readonly<{
  home: string
  /** The model overrides stored in config.yaml. */
  file: ModelPathOverrides
  /** The model overrides from CLI flags, the highest precedence. */
  flags: ModelPathOverrides
}>

/**
 * A relative override is anchored to the home, the directory every Python
 * pass runs in. Resolving here keeps the checks, the download target, and
 * the interpreter's own relative lookups on one path instead of letting a
 * relative string mean the server's working directory on one side and the
 * home on the other.
 */
const anchor = (home: string, value: string): string =>
  isAbsolute(value) ? value : resolve(home, value)

/**
 * The one place model paths are resolved. Precedence per model, highest first:
 * CLI flag, config.yaml, `<home>/models/<name>`. Exactly five paths resolve;
 * nothing else in the home is user-configurable.
 */
export const resolveModelPaths = (input: ResolveModelPathsInput): ModelPaths => {
  const defaults = defaultModelPaths(input.home)
  const pick = (flag: string | undefined, file: string | undefined, fallback: string): string =>
    flag !== undefined
      ? anchor(input.home, flag)
      : file !== undefined
        ? anchor(input.home, file)
        : fallback
  return Object.freeze({
    yue2: pick(input.flags.yue2, input.file.yue2, defaults.yue2),
    yue2Vae: pick(input.flags.yue2Vae, input.file.yue2Vae, defaults.yue2Vae),
    sheetsage2: pick(input.flags.sheetsage2, input.file.sheetsage2, defaults.sheetsage2),
    sheetsage2Base: pick(
      input.flags.sheetsage2Base,
      input.file.sheetsage2Base,
      defaults.sheetsage2Base,
    ),
    whisper: pick(input.flags.whisper, input.file.whisper, defaults.whisper),
  })
}
