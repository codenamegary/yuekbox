import { HostPlatform } from "../shared/platform"
import { mlxYueRuntimePin, yue2RuntimePin } from "../runtime/runtime.pins"
import { IndexStrategy } from "./provisioning.models"

/**
 * The uv release yuekbox downloads and manages itself. A uv found on PATH
 * is deliberately ignored, so provisioning always runs this exact version.
 * Pinned to one release archive per platform, each with its SHA-256 so a
 * corrupted or substituted archive never lands in the home. The local
 * uv 0.9.18 is the version this was developed and verified against; bump
 * the version and every URL and checksum together.
 *
 * Checksums come from each release's `.sha256` asset:
 * https://github.com/astral-sh/uv/releases/tag/0.9.18
 */
export type UvPin = Readonly<{
  version: string
  target: string
  archiveUrl: string
  sha256: string
}>

export const uvPins: Readonly<Record<HostPlatform, UvPin>> = Object.freeze({
  linux: Object.freeze({
    version: "0.9.18",
    target: "x86_64-unknown-linux-gnu",
    archiveUrl:
      "https://github.com/astral-sh/uv/releases/download/0.9.18/uv-x86_64-unknown-linux-gnu.tar.gz",
    sha256: "c2def3db178ade63933fa15ffc96e882c196ce53e06173dcee05b36c5f6f68f5",
  }),
  macos: Object.freeze({
    version: "0.9.18",
    target: "aarch64-apple-darwin",
    archiveUrl:
      "https://github.com/astral-sh/uv/releases/download/0.9.18/uv-aarch64-apple-darwin.tar.gz",
    sha256: "dc3bee4abbb3bac267a3985a23ea7617d19d41ff381dbaf560ba415ad65af68f",
  }),
})

export const uvPinFor = (platform: HostPlatform): UvPin => uvPins[platform]

/** PyPI, the primary index (`--index-url`). */
export const pypiIndexUrl = "https://pypi.org/simple"

/**
 * PyTorch's CUDA 12.8 wheel index. The tested shared environment runs
 * torch 2.10.0+cu128, and no other CUDA index is needed now that yue2,
 * SheetSage2, and the lyric aligner share one torch build. All CUDA 12.x
 * builds run on one driver floor (see provisioning.gpu.ts). macOS never
 * touches this index: its environments run the MLX runtime and torch's
 * plain PyPI build.
 */
export const torchWheelIndexUrl = "https://download.pytorch.org/whl/cu128"

export type VenvPin = Readonly<{
  name: string
  /** The managed Python version the venv is built with. */
  python: string
  /** The primary index (`--index-url`). */
  indexUrl: string
  /**
   * The priority index (`--extra-index-url`). uv checks it first, so the
   * pinned torch build resolves its CUDA 12.8 wheels from here instead of
   * the plain build on PyPI. Null means the one index is all the pin needs.
   */
  extraIndexUrl: string | null
  /** How uv searches the indexes. */
  indexStrategy: IndexStrategy
  /** Exact pins (`name==version`) or direct references (`name @ url`). */
  packages: readonly string[]
}>

/**
 * The one shared environment every Linux Python pass runs in: the yue2
 * runtime, the SheetSage2 transcriber (melody-full and melody-vocal), and
 * the lyric aligner (Demucs plus Whisper). The set is the tested union on
 * the yue2 stack (numpy 2, transformers 4.57.6) recorded from the working
 * local environment; `yue2-infer` pins its own transitive stack in
 * pyproject.toml, so it appears here as the direct git reference.
 */
const linuxVenvPin: VenvPin = Object.freeze({
  name: "python",
  python: "3.12.3",
  indexUrl: pypiIndexUrl,
  extraIndexUrl: torchWheelIndexUrl,
  // uv's default first-index strategy stops at the first index that carries a
  // package, and the CUDA index carries an older setuptools, so the pinned
  // 78.1.1 would never reach PyPI. Both hosts are official and every pin is
  // exact, so the cross-index best-match rule is safe here.
  indexStrategy: "unsafe-best-match",
  packages: Object.freeze([
    `yue2-infer @ git+${yue2RuntimePin.repository}@${yue2RuntimePin.commit}`,
    "torch==2.10.0",
    "torchaudio==2.10.0",
    "transformers==4.57.6",
    "tokenizers==0.22.2",
    "huggingface-hub==0.36.2",
    "safetensors==0.7.0",
    "numpy==2.2.6",
    "scipy==1.18.1",
    "pretty-midi==0.2.10",
    "mir-eval==0.8.2",
    "mido==1.3.3",
    "soundfile==0.13.1",
    // pretty_midi imports pkg_resources, so the stack pins this.
    "setuptools==78.1.1",
    "demucs==4.1.0",
  ]),
})

/**
 * The macOS generation and transcription environment. The MLX runtime is
 * Torch-free by design: generation, the VAE decoder, and the SheetSage2/
 * MERT2 transcriber all run on the Apple Silicon GPU through mlx-yue, whose
 * pyproject pins its whole dependency set exactly. The transcription extra
 * carries the ABC/MIDI/LAB exporters the vendored cover script drives.
 */
const macosGenerationVenvPin: VenvPin = Object.freeze({
  name: "python",
  python: "3.12.3",
  indexUrl: pypiIndexUrl,
  extraIndexUrl: null,
  indexStrategy: "unsafe-best-match",
  packages: Object.freeze([
    `mlx-yue[transcription] @ git+${mlxYueRuntimePin.repository}@${mlxYueRuntimePin.commit}`,
  ]),
})

/**
 * The macOS lyric aligner. Demucs separates the vocal stem on torch's plain
 * PyPI build (CPU by default, MPS by configuration), and mlx-whisper reads
 * word timestamps from that stem on the MLX side of the same environment.
 */
const macosAlignVenvPin: VenvPin = Object.freeze({
  name: "align",
  python: "3.12.3",
  indexUrl: pypiIndexUrl,
  extraIndexUrl: null,
  indexStrategy: "unsafe-best-match",
  packages: Object.freeze([
    "torch==2.10.0",
    "torchaudio==2.10.0",
    "demucs==4.1.0",
    "mlx-whisper==0.4.3",
    "huggingface-hub==0.36.2",
    "numpy==2.2.6",
    "scipy==1.18.1",
    "soundfile==0.13.1",
  ]),
})

/**
 * The environments a platform provisions, in install order. Linux builds one
 * shared environment; macOS builds two, because its MLX runtime is
 * Torch-free and the aligner still needs torch for the vocal separation.
 * `torchIndexUrl` is the CUDA wheel index the GPU check picked on Linux;
 * macOS ignores it.
 */
export const venvPinsFor = (
  platform: HostPlatform,
  torchIndexUrl: string | null,
): readonly VenvPin[] => {
  switch (platform) {
    case "linux":
      return [torchIndexUrl === null ? linuxVenvPin : { ...linuxVenvPin, extraIndexUrl: torchIndexUrl }]
    case "macos":
      return [macosGenerationVenvPin, macosAlignVenvPin]
  }
}

/** Every pinned Python uv installs. Each environment needs the same one. */
export const managedPythonVersions: readonly string[] = Object.freeze([linuxVenvPin.python])

/**
 * The identity of a built environment: python plus the exact dependency set.
 * The adapter stores it inside the environment and skips the build when it
 * matches, so a rerun is a no-op and a pin bump rebuilds.
 */
export const venvFingerprint = (pin: VenvPin): string =>
  JSON.stringify({
    python: pin.python,
    indexUrl: pin.indexUrl,
    extraIndexUrl: pin.extraIndexUrl,
    indexStrategy: pin.indexStrategy,
    packages: pin.packages,
  })
