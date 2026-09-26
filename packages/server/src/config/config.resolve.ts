import { isAbsolute, join, resolve } from "node:path"
import { ModelPathOverrides, ModelPaths } from "contracts/http/config"
import { modelKeyOrder } from "contracts/http/models"
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
  /** The model overrides stored in config.yaml. Null means "use the default". */
  file: ModelPathOverrides
  /** The model overrides from CLI flags, the highest precedence. */
  flags: ModelPathOverrides
}>

/**
 * A relative config.yaml value is anchored to the home, the directory every
 * Python pass runs in. Resolving here keeps the checks, the download target,
 * and the interpreter's own relative lookups on one path instead of letting
 * a relative string mean the server's working directory on one side and the
 * home on the other. CLI flags were already made absolute at parse time.
 */
const anchor = (home: string, value: string): string =>
  isAbsolute(value) ? value : resolve(home, value)

/**
 * The one place model paths are resolved. Precedence per model, highest first:
 * CLI flag, config.yaml, `<home>/models/<name>`. Exactly five paths resolve;
 * nothing else in the home is user-configurable. A null override is a reset:
 * it falls through to the default like a missing key. Flag values arrive
 * absolute (the CLI anchored them to the shell); a relative config.yaml value
 * is anchored to the home, the directory every Python pass runs in.
 */
export const resolveModelPaths = (input: ResolveModelPathsInput): ModelPaths => {
  const defaults = defaultModelPaths(input.home)
  const pick = (key: (typeof modelKeyOrder)[number]): string => {
    const flag = input.flags[key]
    if (flag !== null && flag !== undefined) return flag
    const file = input.file[key]
    return file === null || file === undefined ? defaults[key] : anchor(input.home, file)
  }
  return Object.freeze({
    yue2: pick("yue2"),
    yue2Vae: pick("yue2Vae"),
    sheetsage2: pick("sheetsage2"),
    sheetsage2Base: pick("sheetsage2Base"),
    whisper: pick("whisper"),
  })
}
