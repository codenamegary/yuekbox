import { expect, test } from "bun:test"
import { yue2RuntimePin } from "../runtime/runtime.pins"
import {
  managedPythonVersions,
  pypiIndexUrl,
  torchWheelIndexes,
  uvPin,
  venvFingerprint,
  venvPins,
} from "./provisioning.packages"

test("uv is pinned to one release archive with a checksum", () => {
  expect(uvPin.version).toBe("0.9.18")
  expect(uvPin.archiveUrl).toBe(
    "https://github.com/astral-sh/uv/releases/download/0.9.18/uv-x86_64-unknown-linux-gnu.tar.gz",
  )
  expect(uvPin.sha256).toBe("c2def3db178ade63933fa15ffc96e882c196ce53e06173dcee05b36c5f6f68f5")
})

test("the yue2 venv pins the runtime source and the CUDA 12.8 wheels", () => {
  expect(venvPins.yue2.name).toBe("yue2")
  expect(venvPins.yue2.python).toBe("3.12.3")
  expect(venvPins.yue2.indexUrl).toBe("https://download.pytorch.org/whl/cu128")
  expect(venvPins.yue2.extraIndexUrl).toBe(pypiIndexUrl)
  expect(venvPins.yue2.packages).toContain(
    `yue2-infer @ git+${yue2RuntimePin.repository}@${yue2RuntimePin.commit}`,
  )
  expect(venvPins.yue2.packages).toContain("torch==2.10.0")
})

test("sheetsage2 pins the CUDA 12.6 wheels and its transformer stack", () => {
  expect(venvPins.sheetsage2.name).toBe("sheetsage2")
  expect(venvPins.sheetsage2.python).toBe("3.11.14")
  expect(venvPins.sheetsage2.indexUrl).toBe("https://download.pytorch.org/whl/cu126")
  expect(venvPins.sheetsage2.packages).toContain("torch==2.8.0")
  expect(venvPins.sheetsage2.packages).toContain("torchaudio==2.8.0")
  expect(venvPins.sheetsage2.packages).toContain("transformers==4.45.2")
  expect(venvPins.sheetsage2.packages).toContain("numpy==1.24.3")
  expect(venvPins.sheetsage2.packages).toContain("pretty-midi==0.2.10")
  // pretty_midi imports pkg_resources at runtime.
  expect(venvPins.sheetsage2.packages).toContain("setuptools==78.1.1")
})

test("lyricalign pins demucs and the whisper pipeline on the CUDA 12.6 wheels", () => {
  expect(venvPins.lyricalign.name).toBe("lyricalign")
  expect(venvPins.lyricalign.python).toBe("3.12.3")
  expect(venvPins.lyricalign.indexUrl).toBe("https://download.pytorch.org/whl/cu126")
  expect(venvPins.lyricalign.packages).toContain("demucs==4.1.0")
  expect(venvPins.lyricalign.packages).toContain("torch==2.8.0")
  expect(venvPins.lyricalign.packages).toContain("soundfile==0.14.0")
  expect(
    venvPins.lyricalign.packages.some((requirement) => requirement.startsWith("transformers==")),
  ).toBe(true)
})

test("the torch wheel indexes are the two PyTorch CUDA 12 indexes", () => {
  expect(torchWheelIndexes).toEqual({
    cu126: "https://download.pytorch.org/whl/cu126",
    cu128: "https://download.pytorch.org/whl/cu128",
  })
  expect(pypiIndexUrl).toBe("https://pypi.org/simple")
})

test("every dependency is pinned to an exact version or a direct reference", () => {
  for (const pin of Object.values(venvPins)) {
    expect(pin.packages.length).toBeGreaterThan(0)
    for (const requirement of pin.packages) {
      if (requirement.includes(" @ ")) continue
      expect(requirement).toMatch(/^[A-Za-z0-9._-]+==[0-9][^\s]*$/)
    }
  }
})

test("managed python versions cover every venv exactly once", () => {
  const wanted = Object.values(venvPins).map((pin) => pin.python)

  expect(managedPythonVersions).toEqual([...new Set(wanted)])
})

test("fingerprints are stable, unique per venv, and change with the pins", () => {
  const yue2 = venvFingerprint(venvPins.yue2)

  expect(venvFingerprint(venvPins.yue2)).toBe(yue2)
  expect(venvFingerprint(venvPins.sheetsage2)).not.toBe(yue2)
  expect(venvFingerprint(venvPins.lyricalign)).not.toBe(yue2)

  const bumped = { ...venvPins.yue2, packages: [...venvPins.yue2.packages, "einops==0.8.2"] }
  expect(venvFingerprint(bumped)).not.toBe(yue2)
})
