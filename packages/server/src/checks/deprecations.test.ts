import { expect, test } from "bun:test"
import { Glob } from "bun"
import { join } from "node:path"

const repoRoot = join(import.meta.dir, "../../../..")

/** Spelled in parts so this guard does not flag itself. */
const removedEnv = ["YUE2", "KIT"].join("_")

test(`no source reads the removed ${removedEnv} escape hatch`, async () => {
  const files = [
    ...new Glob("packages/*/src/**/*.ts").scanSync({ cwd: repoRoot }),
    ...new Glob("packages/*/src/**/*.tsx").scanSync({ cwd: repoRoot }),
  ]
  expect(files.length).toBeGreaterThan(50)

  const offenders: string[] = []
  for (const file of files) {
    const source = await Bun.file(join(repoRoot, file)).text()
    if (source.includes(removedEnv)) offenders.push(file)
  }

  expect(offenders).toEqual([])
})
