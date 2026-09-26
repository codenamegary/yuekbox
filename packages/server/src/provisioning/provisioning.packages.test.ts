import { expect, test } from "bun:test"
import { yue2RuntimePin } from "../runtime/runtime.pins"
import {
  managedPythonVersions,
  pypiIndexUrl,
  torchWheelIndexUrl,
  uvPin,
  venvFingerprint,
  venvPin,
} from "./provisioning.packages"

test("uv is pinned to one release archive with a checksum", () => {
  expect(uvPin.version).toBe("0.9.18")
  expect(uvPin.archiveUrl).toBe(
    "https://github.com/astral-sh/uv/releases/download/0.9.18/uv-x86_64-unknown-linux-gnu.tar.gz",
  )
  expect(uvPin.sha256).toBe("c2def3db178ade63933fa15ffc96e882c196ce53e06173dcee05b36c5f6f68f5")
})

test("one shared environment pins the tested union on the CUDA 12.8 wheels", () => {
  expect(venvPin.name).toBe("python")
  expect(venvPin.python).toBe("3.12.3")
  // uv prefers --extra-index-url over --index-url, so the CUDA wheel index
  // must be the extra index or the pinned torch resolves plain from PyPI.
  expect(venvPin.indexUrl).toBe(pypiIndexUrl)
  expect(venvPin.extraIndexUrl).toBe(torchWheelIndexUrl)
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

test("the one torch wheel index is the CUDA 12.8 index", () => {
  expect(torchWheelIndexUrl).toBe("https://download.pytorch.org/whl/cu128")
  expect(pypiIndexUrl).toBe("https://pypi.org/simple")
})

test("every dependency is pinned to an exact version or a direct reference", () => {
  expect(venvPin.packages.length).toBeGreaterThan(0)
  for (const requirement of venvPin.packages) {
    if (requirement.includes(" @ ")) continue
    expect(requirement).toMatch(/^[A-Za-z0-9._-]+==[0-9][^\s]*$/)
  }
})

test("one managed python version covers the one environment", () => {
  expect(managedPythonVersions).toEqual(["3.12.3"])
})

test("the fingerprint is stable and changes with the pins", () => {
  const fingerprint = venvFingerprint(venvPin)

  expect(venvFingerprint(venvPin)).toBe(fingerprint)

  const bumped = { ...venvPin, packages: [...venvPin.packages, "einops==0.8.2"] }
  expect(venvFingerprint(bumped)).not.toBe(fingerprint)
})
