import { HostPlatform } from "../shared/platform"
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
 * The one place model downloads are pinned, per platform. Revisions were
 * read from the Hugging Face API on 2026-09-24 (Linux) and 2026-09-27
 * (macOS), and `totalBytes` is each pinned revision's recursive file total
 * from `https://huggingface.co/api/models/<repo>/tree/<revision>?recursive=true`.
 *
 * The bytes are the same totals `readiness.models.ts` reports for a missing
 * model, so the dialog's estimate and the download agree. To bump: read the
 * new revision and its tree total, update both constants, and download once
 * into a scratch home before landing.
 *
 * The macOS set exists because the MLX runtime verifies exact pinned
 * content: the generator ships pre-converted (the port refuses any other
 * revision's weights), the VAE and SheetSage2 revisions are the ones the
 * port pins, and whisper is the community MLX conversion mlx-whisper loads.
 * Folders stay identical across platforms, so a config.yaml keeps working
 * if a home moves between machines.
 */
const linuxPins: ModelDownloadPins = Object.freeze({
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

const macosPins: ModelDownloadPins = Object.freeze({
  yue2: Object.freeze({
    key: "yue2",
    name: "YuE2-3B (MLX)",
    repo: "vanch007/mlx-Yue2-3B",
    revision: "fa66d203dd56d7e033e05ee8b32269768984c4cc",
    totalBytes: 9_920_193_845,
    directory: "YuE2-3B",
  }),
  yue2Vae: Object.freeze({
    key: "yue2Vae",
    name: "YuE2-Vae",
    repo: "m-a-p/YuE2-Vae",
    revision: "95535e72a97bc0f09b8ada125d26b4009428c0e8",
    totalBytes: 531_142_268,
    directory: "YuE2-Vae",
  }),
  sheetsage2: Object.freeze({
    key: "sheetsage2",
    name: "SheetSage2",
    repo: "m-a-p/SheetSage2",
    revision: "eab522a8168e8b8b8c4856bf8609cd86198f01fe",
    totalBytes: 232_629_154,
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
    name: "Whisper large-v3-turbo (MLX)",
    repo: "mlx-community/whisper-large-v3-turbo",
    revision: "a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb",
    totalBytes: 1_613_979_758,
    directory: "whisper-large-v3-turbo",
  }),
})

const pinsByPlatform: Readonly<Record<HostPlatform, ModelDownloadPins>> = Object.freeze({
  linux: linuxPins,
  macos: macosPins,
})

export type ModelDownloadPins = Readonly<Record<ModelDownloadKey, ModelDownloadPin>>

/** The pin set for the platform the server runs on. */
export const modelDownloadPinsFor = (platform: HostPlatform): ModelDownloadPins =>
  pinsByPlatform[platform]

/**
 * The byte total a full download writes per model, read straight from the
 * pins. Readiness reports this for a missing model, so the dialog's estimate
 * and the download can never drift apart.
 */
export const expectedModelSizesFor = (
  platform: HostPlatform,
): Readonly<Record<ModelDownloadKey, number>> => {
  const pins = pinsByPlatform[platform]
  return Object.freeze({
    yue2: pins.yue2.totalBytes,
    yue2Vae: pins.yue2Vae.totalBytes,
    sheetsage2: pins.sheetsage2.totalBytes,
    sheetsage2Base: pins.sheetsage2Base.totalBytes,
    whisper: pins.whisper.totalBytes,
  })
}

/** The Linux pin set and its sizes: the shape every consumer already had. */
export const modelDownloadPins = linuxPins
export const expectedModelSizes = expectedModelSizesFor("linux")
