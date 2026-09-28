import { describe, expect, test } from "bun:test"
import { cwd } from "node:process"
import { join } from "node:path"
import { parseInvocation } from "./lifecycle.parse"

const parse = async (argv: readonly string[]) => parseInvocation(argv, "0.4.0")

describe("the yuekbox command line", () => {
  test("bare yuekbox means start", async () => {
    const result = await parse([])
    expect(result.kind).toBe("invocation")
    if (result.kind !== "invocation") return
    expect(result.invocation).toEqual({
      command: "start",
      home: null,
      configPath: null,
      models: {},
      provision: false,
      json: false,
      purge: false,
      daemonChild: false,
    })
  })

  test("every command parses, before or after its flags", async () => {
    for (const command of ["start", "stop", "status", "uninstall"] as const) {
      const before = await parse(["--home", "/srv/x", command])
      const after = await parse([command, "--home", "/srv/x"])
      expect(before.kind).toBe("invocation")
      expect(after.kind).toBe("invocation")
      if (before.kind !== "invocation" || after.kind !== "invocation") return
      expect(before.invocation.command).toBe(command)
      expect(after.invocation.command).toBe(command)
      expect(before.invocation.home).toBe("/srv/x")
      expect(after.invocation.home).toBe("/srv/x")
    }
  })

  test("the five model flags map to their model keys", async () => {
    const result = await parse([
      "start",
      "--yue2-model",
      "/a/YuE2-3B",
      "--yue2-vae",
      "/a/YuE2-Vae",
      "--sheetsage2",
      "/a/SheetSage2",
      "--sheetsage2-base",
      "/a/MERT-v2-FullSong",
      "--whisper",
      "/a/whisper",
    ])
    expect(result.kind).toBe("invocation")
    if (result.kind !== "invocation") return
    expect(result.invocation.models).toEqual({
      yue2: "/a/YuE2-3B",
      yue2Vae: "/a/YuE2-Vae",
      sheetsage2: "/a/SheetSage2",
      sheetsage2Base: "/a/MERT-v2-FullSong",
      whisper: "/a/whisper",
    })
  })

  test("relative flag values anchor to the shell cwd", async () => {
    const result = await parse(["--home", "scratch", "--yue2-model", "models/YuE2-3B"])
    expect(result.kind).toBe("invocation")
    if (result.kind !== "invocation") return
    expect(result.invocation.home).toBe(join(cwd(), "scratch"))
    expect(result.invocation.models.yue2).toBe(join(cwd(), "models/YuE2-3B"))
  })

  test("--provision sets the parsed flag", async () => {
    const result = await parse(["--provision"])
    expect(result.kind).toBe("invocation")
    if (result.kind !== "invocation") return
    expect(result.invocation.provision).toBe(true)
  })

  test("status --json and uninstall --purge set their flags", async () => {
    const status = await parse(["status", "--json"])
    const uninstall = await parse(["uninstall", "--purge"])
    expect(status.kind).toBe("invocation")
    expect(uninstall.kind).toBe("invocation")
    if (status.kind !== "invocation" || uninstall.kind !== "invocation") return
    expect(status.invocation.json).toBe(true)
    expect(uninstall.invocation.purge).toBe(true)
  })

  test("inline --flag=value works and the last flag wins", async () => {
    const result = await parse([
      "start",
      "--home=/first",
      "--home",
      "/second",
      "--yue2-model=/a",
      "--yue2-model=/b",
    ])
    expect(result.kind).toBe("invocation")
    if (result.kind !== "invocation") return
    expect(result.invocation.home).toBe("/second")
    expect(result.invocation.models.yue2).toBe("/b")
  })

  test("an unknown command fails loud", async () => {
    const result = await parse(["restart"])
    expect(result.kind).toBe("error")
    if (result.kind !== "error") return
    expect(result.exitCode).toBe(1)
    expect(result.message).toContain("restart")
  })

  test("a stray positional fails loud", async () => {
    const result = await parse(["--home", "/srv/x", "bogus"])
    expect(result.kind).toBe("error")
    if (result.kind !== "error") return
    expect(result.exitCode).toBe(1)
    expect(result.message).toContain("bogus")
  })

  test("an unknown flag fails loud", async () => {
    const result = await parse(["start", "--port", "3000"])
    expect(result.kind).toBe("error")
    if (result.kind !== "error") return
    expect(result.exitCode).toBe(1)
    expect(result.message).toContain("unknown option")
  })

  test("a flag missing its value fails loud", async () => {
    const result = await parse(["start", "--home"])
    expect(result.kind).toBe("error")
    if (result.kind !== "error") return
    expect(result.exitCode).toBe(1)
  })

  test("--help prints the commands and hides the daemon option", async () => {
    const result = await parse(["--help"])
    expect(result.kind).toBe("help")
    if (result.kind !== "help") return
    for (const command of ["start", "stop", "status", "uninstall"]) {
      expect(result.text).toContain(command)
    }
    expect(result.text).toContain("--yue2-model")
    expect(result.text).not.toContain("daemon-child")
  })

  test("<command> --help prints that command's help", async () => {
    const result = await parse(["uninstall", "--help"])
    expect(result.kind).toBe("help")
    if (result.kind !== "help") return
    expect(result.text).toContain("--purge")
  })

  test("--version reports the version", async () => {
    const result = await parse(["--version"])
    expect(result.kind).toBe("version")
    if (result.kind !== "version") return
    expect(result.text).toBe("0.4.0")
  })

  test("the hidden --daemon-child option parses without help text", async () => {
    const result = await parse(["--daemon-child", "--home", "/srv/x"])
    expect(result.kind).toBe("invocation")
    if (result.kind !== "invocation") return
    expect(result.invocation.daemonChild).toBe(true)
    expect(result.invocation.command).toBe("start")
    expect(result.invocation.home).toBe("/srv/x")
  })
})
