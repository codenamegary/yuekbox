import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { version } from "./version"

/** The root manifest release-please bumps; deliberately read from disk, not imported. */
const rootPackagePath = join(import.meta.dir, "..", "..", "..", "package.json")

test("version reports the managed root package version", async () => {
  const rootPackage = JSON.parse(await readFile(rootPackagePath, "utf8")) as {
    version?: unknown
  }

  if (typeof rootPackage.version !== "string") {
    throw new Error("the root package.json has no string version")
  }
  expect(version).toBe(rootPackage.version)
})

test("version looks like a release-please semver", () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
})
