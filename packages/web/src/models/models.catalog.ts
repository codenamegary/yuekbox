import { ModelKey, modelKeyOrder } from "contracts/http/models"

/**
 * The five models the user owns. Copy only: the name the row shows, what the
 * model does, and the infinitive the blocked-generation prompt uses. The
 * record covers every key, so lookups never fall back.
 *
 * SheetSage2 reads the melody of a reference. MERT-v2-FullSong is the base
 * model SheetSage2 builds on; it never reads anything by itself.
 */
export type ModelCatalogEntry = Readonly<{
  name: string
  job: string
  need: string
}>

export const modelCatalog: Readonly<Record<ModelKey, ModelCatalogEntry>> = Object.freeze({
  yue2: {
    name: "YuE2-3B",
    job: "writes the song",
    need: "write the song",
  },
  yue2Vae: {
    name: "YuE2-Vae",
    job: "turns the song into audio",
    need: "turn the song into audio",
  },
  sheetsage2: {
    name: "SheetSage2",
    job: "reads a reference's melody, beat, and sections",
    need: "read the melody, beat, and sections",
  },
  sheetsage2Base: {
    name: "MERT-v2-FullSong",
    job: "the base model SheetSage2 builds on",
    need: "make reference covers work",
  },
  whisper: {
    name: "Whisper large-v3-turbo",
    job: "times the lyric lines",
    need: "time the lyric lines",
  },
})

/** The rows, in the same report order the readiness report uses. */
export const modelCatalogOrder: readonly ModelKey[] = modelKeyOrder

export const catalogEntryFor = (key: ModelKey): ModelCatalogEntry => modelCatalog[key]

export const catalogNameFor = (key: ModelKey): string => modelCatalog[key].name
