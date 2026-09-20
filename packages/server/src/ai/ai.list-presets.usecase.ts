import { Preset } from "contracts/http/ai"
import { KnownPreset, toPresetDescriptor } from "./ai.presets"

export type ListPresetsDeps = Readonly<{
  presets: readonly KnownPreset[]
}>

export const makeListPresets = (deps: ListPresetsDeps) => (): readonly Preset[] =>
  deps.presets.map(toPresetDescriptor)
