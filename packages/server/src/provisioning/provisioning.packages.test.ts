import { expect, test } from "bun:test"
import { mlxYueRuntimePin, yue2RuntimePin } from "../runtime/runtime.pins"
import {
  managedPythonVersions,
  pypiIndexUrl,
  torchWheelIndexUrl,
  uvPinFor,
  venvFingerprint,
  venvPinsFor,
  VenvPin,
} from "./provisioning.packages"

test("uv is pinned to one release archive per platform, each with a checksum", () => {
  const linux = uvPinFor("linux")
  expect(linux.version).toBe("0.9.18")
  expect(linux.target).toBe("x86_64-unknown-linux-gnu")
  expect(linux.archiveUrl).toBe(
    "https://github.com/astral-sh/uv/releases/download/0.9.18/uv-x86_64-unknown-linux-gnu.tar.gz",
  )
  expect(linux.sha256).toBe("c2def3db178ade63933fa15ffc96e882c196ce53e06173dcee05b36c5f6f68f5")

  const macos = uvPinFor("macos")
  expect(macos.version).toBe(linux.version)
  expect(macos.target).toBe("aarch64-apple-darwin")
  expect(macos.archiveUrl).toBe(
    "https://github.com/astral-sh/uv/releases/download/0.9.18/uv-aarch64-apple-darwin.tar.gz",
  )
  expect(macos.sha256).toMatch(/^[0-9a-f]{64}$/)
})

test("one shared environment pins the tested union on the CUDA 12.8 wheels", () => {
  const [venvPin] = venvPinsFor("linux", torchWheelIndexUrl)
  expect(venvPin).toBeDefined()
  if (venvPin === undefined) return
  expect(venvPin.name).toBe("python")
  expect(venvPin.python).toBe("3.12.3")
  // uv gives --extra-index-url priority over --index-url, so the CUDA wheel
  // index must be the extra index or the pinned torch resolves plain from
  // PyPI. The CUDA index also carries an older setuptools, so the default
  // first-index strategy never reaches PyPI for the pin; both are trusted.
  expect(venvPin.indexUrl).toBe(pypiIndexUrl)
  expect(venvPin.extraIndexUrl).toBe(torchWheelIndexUrl)
  expect(venvPin.indexStrategy).toBe("unsafe-best-match")
  expect(venvPin.packages).toEqual([
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
    "setuptools==78.1.1",
    "demucs==4.1.0",
  ])
})

test("macOS provisions two environments: the MLX runtime and the lyric aligner", () => {
  const [generation, align] = venvPinsFor("macos", null)
  expect(generation).toBeDefined()
  expect(align).toBeDefined()
  if (generation === undefined || align === undefined) return

  expect(generation.name).toBe("python")
  // The MLX runtime is Torch-free, so no CUDA index and no torch pin.
  expect(generation.indexUrl).toBe(pypiIndexUrl)
  expect(generation.extraIndexUrl).toBeNull()
  expect(generation.packages).toEqual([
    `mlx-yue[transcription] @ git+${mlxYueRuntimePin.repository}@${mlxYueRuntimePin.commit}`,
  ])

  expect(align.name).toBe("align")
  expect(align.indexUrl).toBe(pypiIndexUrl)
  expect(align.extraIndexUrl).toBeNull()
  // The aligner separates vocals with torch's CPU build and transcribes with
  // mlx-whisper, so demucs and mlx-whisper share one environment.
  const names = align.packages.map((requirement) => requirement.split("==")[0])
  expect(names).toContain("torch")
  expect(names).toContain("demucs")
  expect(names).toContain("mlx-whisper")
})

test("the linux environment is the only one on the CUDA wheel index", () => {
  for (const pin of venvPinsFor("macos", null)) {
    expect(pin.packages.join("\n")).not.toContain(torchWheelIndexUrl)
    expect(pin.packages.join("\n")).not.toContain("torch==2.10.0+cu")
  }
})

test("every dependency is pinned to an exact version or a direct reference", () => {
  const pins: readonly VenvPin[] = [
    ...venvPinsFor("linux", torchWheelIndexUrl),
    ...venvPinsFor("macos", null),
  ]
  for (const pin of pins) {
    expect(pin.packages.length).toBeGreaterThan(0)
    for (const requirement of pin.packages) {
      if (requirement.includes(" @ ")) continue
      expect(requirement).toMatch(/^[A-Za-z0-9._-]+==[0-9][^\s]*$/)
    }
  }
})

test("one managed python version covers every environment", () => {
  expect(managedPythonVersions).toEqual(["3.12.3"])
})

test("the fingerprint is stable and changes with the pins", () => {
  const [venvPin] = venvPinsFor("linux", torchWheelIndexUrl)
  if (venvPin === undefined) return
  const fingerprint = venvFingerprint(venvPin)

  expect(venvFingerprint(venvPin)).toBe(fingerprint)
  // The strategy is part of the stamp, so an environment resolved with a
  // different strategy rebuilds instead of looking current.
  expect(JSON.parse(fingerprint)).toMatchObject({ indexStrategy: "unsafe-best-match" })

  const bumped = { ...venvPin, packages: [...venvPin.packages, "einops==0.8.2"] }
  expect(venvFingerprint(bumped)).not.toBe(fingerprint)
})
