import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  makeEnsureDirectory,
  makeMeasureFileBytes,
  makeMoveDirectory,
  makePathExists,
  makeRemoveDirectory,
} from "./models.fs.adapters"

const withTempDir = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "yuekbox-models-fs-"))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test("pathExists sees files and directories, and not a missing path", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "model.safetensors")
    await writeFile(file, "12345")
    const pathExists = makePathExists()

    expect(await pathExists(dir)).toBe(true)
    expect(await pathExists(file)).toBe(true)
    expect(await pathExists(join(dir, "nope"))).toBe(false)
  })
})

test("ensureDirectory creates every missing parent", async () => {
  await withTempDir(async (dir) => {
    const nested = join(dir, "models", "YuE2-3B", "nested")
    await makeEnsureDirectory()(nested)
    expect(await makePathExists()(nested)).toBe(true)
    // A second call over the existing folder is a no-op.
    await makeEnsureDirectory()(nested)
  })
})

test("moveDirectory renames a staged folder into place", async () => {
  await withTempDir(async (dir) => {
    const from = join(dir, ".downloads", "YuE2-3B")
    const to = join(dir, "YuE2-3B")
    await mkdir(from, { recursive: true })
    await writeFile(join(from, "model.safetensors"), "weights")

    await makeMoveDirectory()(from, to)

    expect(await makePathExists()(from)).toBe(false)
    expect(await readFile(join(to, "model.safetensors"), "utf8")).toBe("weights")
  })
})

test("removeDirectory deletes a tree and tolerates a missing path", async () => {
  await withTempDir(async (dir) => {
    const staged = join(dir, ".downloads", "YuE2-3B")
    await mkdir(staged, { recursive: true })
    await writeFile(join(staged, "model.safetensors"), "weights")
    const removeDirectory = makeRemoveDirectory()

    await removeDirectory(staged)
    await removeDirectory(staged)

    expect(await makePathExists()(staged)).toBe(false)
  })
})

test("measureFileBytes measures files and reports everything else as null", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "model.safetensors")
    await writeFile(file, "12345")
    const measureFileBytes = makeMeasureFileBytes()

    expect(await measureFileBytes(file)).toBe(5)
    expect(await measureFileBytes(dir)).toBeNull()
    expect(await measureFileBytes(join(dir, "missing.bin"))).toBeNull()
  })
})
