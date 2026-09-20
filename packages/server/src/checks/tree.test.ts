import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { Glob } from "bun"
import { checkStructure } from "./structure"

const srcDir = join(import.meta.dir, "..")

describe("server source tree", () => {
  test("every file follows the structure rules", async () => {
    const files = [...new Glob("**/*.ts").scanSync({ cwd: srcDir })]
    expect(files.length).toBeGreaterThan(50)
    expect(files.filter((file) => file.endsWith(".usecase.ts")).length).toBeGreaterThan(0)
    expect(files.filter((file) => file.endsWith(".ports.ts")).length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const file of files) {
      const source = await Bun.file(join(srcDir, file)).text()
      for (const violation of checkStructure(file, source)) {
        violations.push(`${file}: ${violation.message}`)
      }
    }

    expect(violations).toEqual([])
  })
})
