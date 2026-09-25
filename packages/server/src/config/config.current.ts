import { ModelPathOverrides, ModelPaths } from "contracts/http/config"
import { LoadModelOverrides } from "./config.ports"
import { resolveModelPaths } from "./config.resolve"

export type CurrentModelPathsDeps = Readonly<{
  home: string
  /** CLI flags from boot; they stay the highest precedence. */
  flags: ModelPathOverrides
  loadModelOverrides: LoadModelOverrides
}>

/**
 * The five resolved model paths, read at call time: `config.yaml` plus the
 * boot CLI flags through the same precedence the boot resolution uses. A
 * `PUT /v1/config` lands in the next read, so nothing needs a restart.
 */
export type ReadCurrentModelPaths = () => Promise<ModelPaths>

export const makeCurrentModelPaths =
  (deps: CurrentModelPathsDeps): ReadCurrentModelPaths =>
  async () =>
    resolveModelPaths({
      home: deps.home,
      file: await deps.loadModelOverrides(),
      flags: deps.flags,
    })
