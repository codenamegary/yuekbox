import { yue2RuntimePin } from "../runtime/runtime.pins"

/**
 * The uv release yuekbox downloads when the machine has no `uv` on PATH.
 * Pinned to one release archive (x86_64 Linux, the v1 target) and its SHA-256
 * so a corrupted or substituted archive never lands in the home. The local
 * uv 0.9.18 is the version this was developed and verified against; bump the
 * version and both URL and checksum together.
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

/** PyPI, the fallback index for everything the CUDA indexes do not host. */
export const pypiIndexUrl = "https://pypi.org/simple"

/**
 * PyTorch's CUDA wheel indexes. The CUDA tags come from the working local
 * environments: the yue2 environment runs torch 2.10.0+cu128, the sheetsage2
 * and lyric-align environments run torch 2.8.0+cu126. All are CUDA 12.x
 * builds, so one driver floor covers them (see provisioning.gpu.ts).
 */
export const torchWheelIndexes = Object.freeze({
  cu126: "https://download.pytorch.org/whl/cu126",
  cu128: "https://download.pytorch.org/whl/cu128",
})

export type VenvPin = Readonly<{
  name: string
  /** The managed Python version the venv is built with. */
  python: string
  /** The primary index; the CUDA wheel index for torch packages. */
  indexUrl: string
  /** The extra index every other pinned package resolves from. */
  extraIndexUrl: string
  /** Exact pins (`name==version`) or direct references (`name @ url`). */
  packages: readonly string[]
}>

/**
 * The three environments, pinned from the working local environments on this
 * machine (uv pip freeze, 2026-09-24). The yue2 runtime pins its own transitive
 * stack in pyproject.toml, so only the runtime source and torch appear here.
 */
export const venvPins = Object.freeze({
  yue2: Object.freeze({
    name: "yue2",
    python: "3.12.3",
    indexUrl: torchWheelIndexes.cu128,
    extraIndexUrl: pypiIndexUrl,
    packages: Object.freeze([
      `yue2-infer @ git+${yue2RuntimePin.repository}@${yue2RuntimePin.commit}`,
      "torch==2.10.0",
    ]),
  }),
  sheetsage2: Object.freeze({
    name: "sheetsage2",
    python: "3.11.14",
    indexUrl: torchWheelIndexes.cu126,
    extraIndexUrl: pypiIndexUrl,
    packages: Object.freeze([
      "torch==2.8.0",
      "torchaudio==2.8.0",
      "transformers==4.45.2",
      "huggingface-hub==0.36.0",
      "tokenizers==0.20.3",
      "safetensors==0.5.3",
      "numpy==1.24.3",
      "scipy==1.13.1",
      "pretty-midi==0.2.10",
      "mir-eval==0.8.2",
      "mido==1.3.3",
      // pretty_midi imports pkg_resources, so the model's requirements pin this.
      "setuptools==78.1.1",
    ]),
  }),
  lyricalign: Object.freeze({
    name: "lyricalign",
    python: "3.12.3",
    indexUrl: torchWheelIndexes.cu126,
    extraIndexUrl: pypiIndexUrl,
    packages: Object.freeze([
      "torch==2.8.0",
      "torchaudio==2.8.0",
      "transformers==4.57.6",
      "huggingface-hub==0.36.2",
      "tokenizers==0.22.2",
      "safetensors==0.8.0",
      "numpy==2.5.3",
      "soundfile==0.14.0",
      "demucs==4.1.0",
    ]),
  }),
})

/** Every pinned Python uv installs, deduped, in first-use order. */
export const managedPythonVersions: readonly string[] = Object.freeze([
  ...new Set(Object.values(venvPins).map((pin) => pin.python)),
])

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
