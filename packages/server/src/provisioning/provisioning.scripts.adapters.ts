import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describeError } from "../shared/describe"
import { err, ok } from "../shared/result"
import { InstallScripts } from "./provisioning.ports"

/**
 * The repo tool sources and the flat names they take in `<home>/scripts`.
 * transcribe.py imports abc_tools and common as siblings, so the flattened
 * copies must stay together.
 */
export const scriptManifest = Object.freeze([
  { source: "lyric-align/align.py", name: "align.py" },
  { source: "sheetsage2/transcribe.py", name: "transcribe.py" },
  { source: "sheetsage2/abc_tools.py", name: "abc_tools.py" },
  { source: "sheetsage2/common.py", name: "common.py" },
  { source: "yue2/generate.py", name: "generate.py" },
] as const)

/**
 * `packages/server/tools`. In a compiled binary the tools tree is embedded at
 * `/$bunfs/root/tools` (`--asset=packages/server/tools` in scripts/build-binary.ts)
 * and `import.meta.dir` is `/$bunfs/root`, so the standalone branch lands on the
 * embedded copy. `bun run` keeps the real package directory.
 */
export const toolsRoot = Bun.isStandaloneExecutable
  ? join(import.meta.dir, "tools")
  : fileURLToPath(new URL("../../tools/", import.meta.url))

export const makeInstallScripts = (sourceRoot: string): InstallScripts => {
  return async (scriptsDir) => {
    try {
      await mkdir(scriptsDir, { recursive: true })
    } catch (error: unknown) {
      return err({
        kind: "install_scripts_failed",
        detail: `could not create ${scriptsDir}: ${describeError(error)}`,
      })
    }

    const files: string[] = []
    for (const entry of scriptManifest) {
      const source = join(sourceRoot, entry.source)
      try {
        // Bytes rather than copyFile: a compiled binary's sources live under
        // /$bunfs, where node:fs copyFile cannot read. Bun.file reads embedded
        // and on-disk sources alike, so there is no mode branch.
        await Bun.write(join(scriptsDir, entry.name), await Bun.file(source).bytes())
      } catch (error: unknown) {
        return err({
          kind: "install_scripts_failed",
          detail: `could not install ${entry.name} from ${source}: ${describeError(error)}`,
        })
      }
      files.push(entry.name)
    }

    return ok(Object.freeze({ scriptsDir, files: Object.freeze(files) }))
  }
}
