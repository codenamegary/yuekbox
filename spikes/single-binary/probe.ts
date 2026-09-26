// Throwaway spike probe (#51). Run as `bun probe.ts` and as a compiled
// executable; diff the two to see what import.meta and embedded assets resolve
// to. No app code is imported here on purpose.
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import embeddedFile from "./probe-asset/hello.probe" with { type: "file" }
import { otherModuleMeta } from "./probe-other"

const candidate = (p: string): { path: string; exists: boolean } => ({
  path: p,
  exists: existsSync(p),
})

const tryReaddir = (p: string): readonly string[] | string => {
  try {
    return readdirSync(p)
  } catch (error: unknown) {
    return error instanceof Error ? `ERROR: ${error.message}` : `ERROR: ${String(error)}`
  }
}

const embeddedText = await Bun.file(embeddedFile)
  .text()
  .catch((error: unknown) => `ERROR: ${String(error)}`)

const report = {
  bunVersion: Bun.version,
  isStandaloneExecutable: Bun.isStandaloneExecutable,
  execPath: process.execPath,
  cwd: process.cwd(),
  argv: Bun.argv,
  bunMain: Bun.main,
  entry: {
    file: import.meta.file,
    dir: import.meta.dir,
    path: import.meta.path,
    url: import.meta.url,
  },
  otherModule: otherModuleMeta,
  embeddedFileImport: {
    returned: embeddedFile,
    text: embeddedText.trim(),
    viaNodeRead: (() => {
      try {
        return readFileSync(embeddedFile, "utf8").trim()
      } catch (error: unknown) {
        return `ERROR: ${String(error)}`
      }
    })(),
  },
  embeddedFiles: Bun.embeddedFiles.map((blob) => `${blob.name} (${blob.size} bytes)`),
  candidates: [
    candidate(join(import.meta.dir, "probe-asset/hello.probe")),
    candidate(join(import.meta.dir, "assets/note.txt")),
    candidate(join(import.meta.dir, "spikes/single-binary/assets/note.txt")),
    candidate(join(import.meta.dir, "migrations/0000_init.sql")),
    candidate(join(import.meta.dir, "packages/server/src/db/migrations/0000_init.sql")),
    candidate(join(import.meta.dir, "tools/yue2/generate.py")),
    candidate(join(import.meta.dir, "packages/server/tools/yue2/generate.py")),
  ],
  importMetaDirListing: tryReaddir(import.meta.dir),
}

console.log(JSON.stringify(report, null, 2))
