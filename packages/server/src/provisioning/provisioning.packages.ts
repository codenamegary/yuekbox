import { yue2RuntimePin } from "../runtime/runtime.pins"

/**
 * The uv release yuekbox downloads and manages itself. A uv found on PATH
 * is deliberately ignored, so provisioning always runs this exact version.
 * Pinned to one release archive (x86_64 Linux, the v1 target) and its
 * SHA-256 so a corrupted or substituted archive never lands in the home.
 * The local uv 0.9.18 is the version this was developed and verified
 * against; bump the version and both URL and checksum together.
 *
 * Checksums come from the release's `.sha256` asset:
 * https://github.com/astral-sh/uv/releases/tag/0.9.18
 */
export const uvPin = Object.freeze({
  version: "0.9.18",
  target: "x86_64-unknown-linux-gnu",
  archiveUrl:
    "https://github.com/astral-sh/uv/releases/download/0.9.18/uv-x86_64-unknown-linux-gnu.tar.gz",
  sha256: "c2def3db178ade63933fa15ffc96e882c196ce53e06173dcee05b36c5f6f68f5",
})

/** PyPI, the primary index. uv falls back to it for anything the extra index lacks. */
export const pypiIndexUrl = "https://pypi.org/simple"

/**
 * PyTorch's CUDA 12.8 wheel index. The tested shared environment runs
 * torch 2.10.0+cu128, and no other CUDA index is needed now that yue2,
 * SheetSage2, and the lyric aligner share one torch build. All CUDA 12.x
 * builds run on one driver floor (see provisioning.gpu.ts).
 */
export const torchWheelIndexUrl = "https://download.pytorch.org/whl/cu128"

export type VenvPin = Readonly<{
  name: string
  /** The managed Python version the venv is built with. */
  python: string
  /** The primary index (`--index-url`). uv falls back to it. */
  indexUrl: string
  /**
   * The priority index (`--extra-index-url`). uv checks it first, so the
   * pinned torch build resolves its CUDA 12.8 wheels from here instead of
   * the plain build on PyPI.
   */
  extraIndexUrl: string
  /** Exact pins (`name==version`) or direct references (`name @ url`). */
  packages: readonly string[]
}>

/**
 * The one shared environment every Python pass runs in: the yue2 runtime,
 * the SheetSage2 transcriber (melody-full and melody-vocal), and the lyric
 * aligner (Demucs plus Whisper). The set is the tested union on the yue2
 * stack (numpy 2, transformers 4.57.6) recorded from the working local
 * environment; `yue2-infer` pins its own transitive stack in pyproject.toml,
 * so it appears here as the direct git reference.
 */
export const venvPin: VenvPin = Object.freeze({
  name: "python",
  python: "3.12.3",
  indexUrl: pypiIndexUrl,
  extraIndexUrl: torchWheelIndexUrl,
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

/** Every pinned Python uv installs. One shared environment needs one. */
export const managedPythonVersions: readonly string[] = Object.freeze([venvPin.python])

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
    packages: pin.packages,
  })
