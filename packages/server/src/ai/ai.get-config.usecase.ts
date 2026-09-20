import { AiConfig } from "contracts/http/ai"
import { LoadConfig } from "./ai.ports"

export type GetConfigDeps = Readonly<{
  loadConfig: LoadConfig
}>

export const makeGetConfig = (deps: GetConfigDeps) => async (): Promise<AiConfig> =>
  deps.loadConfig()
