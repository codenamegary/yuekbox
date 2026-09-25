import { Readiness } from "contracts/http/readiness"

/** The five user-configurable models, in report order. */
export const modelReadinessKeys = Object.freeze([
  "yue2",
  "yue2Vae",
  "sheetsage2",
  "sheetsage2Base",
  "whisper",
] as const)

export type ModelReadinessKey = (typeof modelReadinessKeys)[number]

/**
 * Expected bytes for a full snapshot download of each model, read from the
 * Hugging Face model API's current-revision tree totals on 2026-09-24:
 * `m-a-p/YuE2-3B`, `m-a-p/YuE2-Vae`, `m-a-p/SheetSage2`,
 * `m-a-p/MERT-v2-FullSong`, and `openai/whisper-large-v3-turbo`. This is what a
 * model download (#54) puts on disk, so a missing model reports it as `size`;
 * `models.pins.ts` carries the same totals next to the pinned revisions, and a
 * test keeps the two in step.
 */
export const expectedModelSizes: Readonly<Record<ModelReadinessKey, number>> = Object.freeze({
  yue2: 7_295_775_491,
  yue2Vae: 531_343_726,
  sheetsage2: 233_240_091,
  sheetsage2Base: 2_530_365_136,
  whisper: 1_622_466_054,
})

/** One readiness snapshot, the capability the app consumes. */
export type ReadinessReader = () => Promise<Readiness>
