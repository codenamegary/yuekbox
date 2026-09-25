import { ModelPathOverrides } from "contracts/http/config"

/** The model overrides stored in config.yaml. A missing file means none. */
export type LoadModelOverrides = () => Promise<ModelPathOverrides>

/** Replace the stored model overrides. The write is atomic. */
export type SaveModelOverrides = (overrides: ModelPathOverrides) => Promise<void>
