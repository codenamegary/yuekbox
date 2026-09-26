import { ModelKey } from "contracts/http/models"

/**
 * The five models the user owns. Copy only: the name the row shows, what the
 * model does, and the infinitive the blocked-generation prompt uses. Keys and
 * order match the readiness report.
 */
export type ModelCatalogEntry = Readonly<{
  key: ModelKey
  name: string
  job: string
  need: string
}>

export const modelCatalog: readonly ModelCatalogEntry[] = Object.freeze([
  {
    key: "yue2",
    name: "YuE2-3B",
    job: "writes the song",
    need: "write the song",
  },
  {
    key: "yue2Vae",
    name: "YuE2-Vae",
    job: "turns the song into audio",
    need: "turn the song into audio",
  },
  {
    key: "sheetsage2",
    name: "SheetSage2",
    job: "finds the beat and sections",
    need: "find the beat and sections",
  },
  {
    key: "sheetsage2Base",
    name: "MERT-v2-FullSong",
    job: "reads the melody of a reference",
    need: "make reference covers work",
  },
  {
    key: "whisper",
    name: "Whisper large-v3-turbo",
    job: "times the lyric lines",
    need: "time the lyric lines",
  },
])

export const catalogEntryFor = (key: ModelKey): ModelCatalogEntry | undefined =>
  modelCatalog.find((entry) => entry.key === key)

export const catalogNameFor = (key: ModelKey): string => catalogEntryFor(key)?.name ?? key
