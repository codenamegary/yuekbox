import { copyFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
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

/** `packages/server/tools`, resolved from this module. */
export const toolsRoot = fileURLToPath(new URL("../../tools/", import.meta.url))

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

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
        await copyFile(source, join(scriptsDir, entry.name))
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
