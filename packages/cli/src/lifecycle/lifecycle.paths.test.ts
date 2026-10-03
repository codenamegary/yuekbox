import { describe, test, expect } from "bun:test"
import { entryExecutablePath } from "./lifecycle.paths"

describe("entryExecutablePath", () => {
  test("a compiled binary is its own executable", () => {
    const entry = entryExecutablePath(true, ["/opt/yuekbox", "stop"], "/opt/yuekbox")
    expect(entry).toBe("/opt/yuekbox")
  })

  test("an npm install launches bun with the bin symlink as the entry", () => {
    const entry = entryExecutablePath(
      false,
      ["bun", "/prefix/bin/yuekbox", "stop"],
      "/home/u/.bun/bin/bun",
    )
    expect(entry).toBe("/prefix/bin/yuekbox")
  })

  test("falls back to the interpreter when argv carries no entry", () => {
    const entry = entryExecutablePath(false, ["bun"], "/home/u/.bun/bin/bun")
    expect(entry).toBe("/home/u/.bun/bin/bun")
  })
})
