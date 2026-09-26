import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveBootEnv } from "./config/config.boot"
import { checkLyricAlign } from "./generation/generation.lyricalign.adapters"
import { checkSheetsage2 } from "./generation/generation.sheetsage2.adapters"
import { checkYue2 } from "./generation/generation.yue2.adapters"

/**
 * The process root wires every generation adapter from `boot.python`, and the
 * boot env no longer carries a per-runtime interpreter. This proves one file
 * at the shared path is what turns all three adapters on.
 */
test("the one shared interpreter turns on all three generation adapters", async () => {
  const home = await mkdtemp(join(tmpdir(), "yuekbox-shared-python-test-"))
  try {
    const boot = await resolveBootEnv({
      argv: ["bun", "src/server.ts", "--home", home],
      env: {},
      osHome: "/home/u",
      loadModelOverrides: async () => ({}),
    })
    const checks = () => ({
      yue2: checkYue2({
        pythonBin: boot.python,
        scriptPath: boot.generateScript,
        model: boot.modelPaths.yue2,
        vae: boot.modelPaths.yue2Vae,
      }),
      sheetsage2: checkSheetsage2({
        pythonBin: boot.python,
        scriptPath: boot.sheetsage2Script,
      }),
      lyricAlign: checkLyricAlign({
        pythonBin: boot.python,
        scriptPath: boot.lyricAlignScript,
      }),
    })

    expect(boot.python).toBe(join(home, "venvs/python/bin/python"))
    expect(checks()).toEqual({ yue2: "missing", sheetsage2: "missing", lyricAlign: "missing" })

    await mkdir(join(home, "venvs", "python", "bin"), { recursive: true })
    await writeFile(boot.python, "", "utf8")
    await mkdir(join(home, "scripts"), { recursive: true })
    await writeFile(boot.generateScript, "", "utf8")
    await writeFile(boot.sheetsage2Script, "", "utf8")
    await writeFile(boot.lyricAlignScript, "", "utf8")
    await mkdir(boot.modelPaths.yue2, { recursive: true })
    await mkdir(boot.modelPaths.yue2Vae, { recursive: true })

    expect(checks()).toEqual({ yue2: "ok", sheetsage2: "ok", lyricAlign: "ok" })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
