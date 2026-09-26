import { ModelDownloadKey } from "./models.models"

/** One pinned Hugging Face snapshot. `totalBytes` is what a full download writes. */
export type ModelDownloadPin = Readonly<{
  key: ModelDownloadKey
  /** Plain display name; never a runtime, venv, or helper. */
  name: string
  /** The upstream repository, `owner/name`. */
  repo: string
  /** The exact revision SHA the download resolves every file at. */
  revision: string
  /** The pinned revision's byte total, cross-checked when the tree is fetched. */
  totalBytes: number
  /** The default folder name under `<home>/models`. */
  directory: string
}>

/**
 * The one place model downloads are pinned. Revisions were read from the
 * Hugging Face API on 2026-09-24, and `totalBytes` is each pinned revision's
 * recursive file total from
 * `https://huggingface.co/api/models/<repo>/tree/<revision>?recursive=true`.
 *
 * The bytes are the same totals `readiness.models.ts` reports for a missing
 * model, so the dialog's estimate and the download agree. To bump: read the
 * new revision and its tree total, update both constants, and download once
 * into a scratch home before landing.
 */
export const modelDownloadPins: ModelDownloadPins = Object.freeze({
  yue2: Object.freeze({
    key: "yue2",
    name: "YuE2-3B",
    repo: "m-a-p/YuE2-3B",
    revision: "14fc6c6f146441b1dd6363fcb2e01e82a6914cb7",
    totalBytes: 7_295_775_491,
    directory: "YuE2-3B",
  }),
  yue2Vae: Object.freeze({
    key: "yue2Vae",
    name: "YuE2-Vae",
    repo: "m-a-p/YuE2-Vae",
    revision: "9a94e1d0ea9f8087e98f77fa88df4a4068104d2a",
    totalBytes: 531_343_726,
    directory: "YuE2-Vae",
  }),
  sheetsage2: Object.freeze({
    key: "sheetsage2",
    name: "SheetSage2",
    repo: "m-a-p/SheetSage2",
    revision: "55bfe14e32d8b663629b3a86b0f3285c2ca5da0b",
    totalBytes: 233_240_091,
    directory: "SheetSage2",
  }),
  sheetsage2Base: Object.freeze({
    key: "sheetsage2Base",
    name: "MERT-v2-FullSong",
    repo: "m-a-p/MERT-v2-FullSong",
    revision: "d8ba1c745e733b3908ce6ad16ebeb17ac7600a42",
    totalBytes: 2_530_365_136,
    directory: "MERT-v2-FullSong",
  }),
  whisper: Object.freeze({
    key: "whisper",
    name: "Whisper large-v3-turbo",
    repo: "openai/whisper-large-v3-turbo",
    revision: "41f01f3fe87f28c78e2fbf8b568835947dd65ed9",
    totalBytes: 1_622_466_054,
    directory: "whisper-large-v3-turbo",
  }),
})

export type ModelDownloadPins = Readonly<Record<ModelDownloadKey, ModelDownloadPin>>

/**
 * The byte total a full download writes per model, read straight from the
 * pins. Readiness reports this for a missing model, so the dialog's estimate
 * and the download can never drift apart.
 */
export const expectedModelSizes: Readonly<Record<ModelDownloadKey, number>> = Object.freeze({
  yue2: modelDownloadPins.yue2.totalBytes,
  yue2Vae: modelDownloadPins.yue2Vae.totalBytes,
  sheetsage2: modelDownloadPins.sheetsage2.totalBytes,
  sheetsage2Base: modelDownloadPins.sheetsage2Base.totalBytes,
  whisper: modelDownloadPins.whisper.totalBytes,
})
