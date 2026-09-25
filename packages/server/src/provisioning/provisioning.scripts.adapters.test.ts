import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { makeInstallScripts, scriptManifest, toolsRoot } from "./provisioning.scripts.adapters"

const withTempDir = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "yuekbox-install-scripts-test-"))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Builds a source tree holding one file per manifest entry, keyed by its path. */
const writeSources = async (sourceRoot: string): Promise<void> => {
  for (const entry of scriptManifest) {
    const path = join(sourceRoot, entry.source)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `# ${entry.source}\n`, "utf8")
  }
}

test("installs every tool into the scripts dir, flattened", async () => {
  await withTempDir(async (dir) => {
    const sourceRoot = join(dir, "tools")
    const scriptsDir = join(dir, "scripts")
    await writeSources(sourceRoot)

    const result = await makeInstallScripts(sourceRoot)(scriptsDir)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      scriptsDir,
      files: ["align.py", "transcribe.py", "abc_tools.py", "common.py", "generate.py"],
    })
    for (const entry of scriptManifest) {
      expect(await readFile(join(scriptsDir, entry.name), "utf8")).toBe(`# ${entry.source}\n`)
    }
  })
})

test("rerunning overwrites its own files and leaves unrelated files alone", async () => {
  await withTempDir(async (dir) => {
    const sourceRoot = join(dir, "tools")
    const scriptsDir = join(dir, "scripts")
    await writeSources(sourceRoot)
    const installScripts = makeInstallScripts(sourceRoot)

    await installScripts(scriptsDir)
    await writeFile(join(scriptsDir, "notes.txt"), "keep me", "utf8")
    await writeFile(join(scriptsDir, "align.py"), "stale\n", "utf8")
    await writeFile(join(sourceRoot, "lyric-align/align.py"), "# fresh\n", "utf8")

    const second = await installScripts(scriptsDir)

    expect(second.ok).toBe(true)
    expect(await readFile(join(scriptsDir, "align.py"), "utf8")).toBe("# fresh\n")
    expect(await readFile(join(scriptsDir, "notes.txt"), "utf8")).toBe("keep me")
    expect((await readdir(scriptsDir)).toSorted()).toEqual(
      [
        "abc_tools.py",
        "align.py",
        "common.py",
        "generate.py",
        "notes.txt",
        "transcribe.py",
      ].toSorted(),
    )
  })
})

test("a missing tool source fails with the source path", async () => {
  await withTempDir(async (dir) => {
    const result = await makeInstallScripts(join(dir, "missing-tools"))(join(dir, "scripts"))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("install_scripts_failed")
    expect(result.error.detail).toContain(join(dir, "missing-tools", scriptManifest[0].source))
  })
})

test("manifest names are flat and unique", () => {
  const names: readonly string[] = scriptManifest.map((entry) => entry.name)

  expect(names).toEqual([...new Set(names)])
  for (const name of names) {
    expect(name).toBe(basename(name))
  }
})

test("every manifest source exists in the repo tools root", () => {
  for (const entry of scriptManifest) {
    expect(existsSync(join(toolsRoot, entry.source))).toBe(true)
  }
})

test("vendored sheetsage2 tools keep their origin and license header", async () => {
  for (const name of ["transcribe.py", "abc_tools.py", "common.py"]) {
    const header = (await readFile(join(toolsRoot, "sheetsage2", name), "utf8")).slice(0, 600)

    expect(header).toContain("Vendored from YuE")
    expect(header).toContain("Apache-2.0")
    expect(header).toMatch(/revision\n?# [0-9a-f]{40}/)
  }
})
