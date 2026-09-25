import { Config, ModelPathOverrides } from "contracts/http/config"
import { LoadModelOverrides } from "./config.ports"
import { resolveModelPaths } from "./config.resolve"

export type GetConfigDeps = Readonly<{
  loadModelOverrides: LoadModelOverrides
  home: string
  flags: ModelPathOverrides
}>

/** The effective model paths: CLI flags over config.yaml over the home defaults. */
export const makeGetConfig = (deps: GetConfigDeps) => async (): Promise<Config> => ({
  models: resolveModelPaths({
    home: deps.home,
    file: await deps.loadModelOverrides(),
    flags: deps.flags,
  }),
})
