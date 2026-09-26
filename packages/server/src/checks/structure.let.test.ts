import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "bun:test"
import { checkNoLet } from "./structure"

const sourceRoots = ["../../src", "../../../web/src", "../../../contracts/src"].map((root) =>
  join(import.meta.dir, root),
)

const sourceFiles = (root: string): readonly string[] => {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(path)
    }
  }
  walk(root)
  return out
}

test("no file in any package declares a let", () => {
  const violations = sourceRoots.flatMap((root) =>
    sourceFiles(root).flatMap((path) => checkNoLet(path, readFileSync(path, "utf8"))),
  )

  expect(violations.map((violation) => `${violation.file}: ${violation.message}`)).toEqual([])
})
