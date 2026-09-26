import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { ProcessRunner } from "../shared/process"
import { UvTool, VenvRequest } from "./provisioning.models"
import { venvFingerprint, venvPin } from "./provisioning.packages"
import {
  makeEnsurePython,
  makeEnsureVenv,
  managedPythonDir,
  pythonStampPath,
} from "./provisioning.python.adapters"

const uvTool: UvTool = { path: "/tools/uv" }

const withTempDir = async (run: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "yuekbox-python-test-"))
  try {
    await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

type Run = Readonly<{
  command: readonly string[]
  env: Readonly<Record<string, string>> | undefined
}>

const neverRun: ProcessRunner = async () => {
  throw new Error("runProcess should not be called")
}

test("installs each missing python once and records it", async () => {
  await withTempDir(async (dir) => {
    const runs: Run[] = []
    const runProcess: ProcessRunner = async (command, _cwd, _onLine, env) => {
      runs.push({ command, env })
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const ensurePython = makeEnsurePython({ home: dir, runProcess })

    const first = await ensurePython(uvTool, ["3.12.3", "3.11.14"])

    expect(first).toEqual({ ok: true, value: { status: "installed" } })
    const installDir = join(dir, "tools", "python")
    expect(runs.map((run) => [...run.command])).toEqual([
      ["/tools/uv", "python", "install", "--install-dir", installDir, "--no-bin", "3.12.3"],
      ["/tools/uv", "python", "install", "--install-dir", installDir, "--no-bin", "3.11.14"],
    ])
    expect(runs[0]?.env?.UV_PYTHON_INSTALL_DIR).toBe(installDir)
    expect(runs[0]?.env?.UV_CACHE_DIR).toBe(join(dir, "tools", "cache"))
    expect(runs[0]?.env?.UV_NO_CONFIG).toBe("1")
    expect(existsSync(pythonStampPath(dir, "3.12.3"))).toBe(true)
    expect(existsSync(pythonStampPath(dir, "3.11.14"))).toBe(true)

    const second = await makeEnsurePython({ home: dir, runProcess: neverRun })(uvTool, [
      "3.12.3",
      "3.11.14",
    ])

    expect(second).toEqual({ ok: true, value: { status: "ready" } })
  })
})

test("only installs the versions that are missing", async () => {
  await withTempDir(async (dir) => {
    await mkdir(dirname(pythonStampPath(dir, "3.12.3")), { recursive: true })
    await writeFile(pythonStampPath(dir, "3.12.3"), "{}\n", "utf8")
    const runs: Run[] = []
    const runProcess: ProcessRunner = async (command, _cwd, _onLine, env) => {
      runs.push({ command, env })
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }

    const result = await makeEnsurePython({ home: dir, runProcess })(uvTool, ["3.12.3", "3.11.14"])

    expect(result.ok).toBe(true)
    expect(runs).toHaveLength(1)
    expect(runs[0]?.command).toContain("3.11.14")
  })
})

test("a failed install reports the stderr tail and leaves no stamp", async () => {
  await withTempDir(async (dir) => {
    const runProcess: ProcessRunner = async () => ({
      exitCode: 2,
      stdout: "",
      stderrTail: "error: failed to download cpython-3.12.3",
    })
    const ensurePython = makeEnsurePython({ home: dir, runProcess })

    const result = await ensurePython(uvTool, ["3.12.3"])

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "python_unavailable",
        detail: "error: failed to download cpython-3.12.3",
      },
    })
    expect(existsSync(pythonStampPath(dir, "3.12.3"))).toBe(false)
  })
})

test("a retry after a failed install runs it again", async () => {
  await withTempDir(async (dir) => {
    const commands: string[][] = []
    const failing: ProcessRunner = async (command) => {
      commands.push([...command])
      return { exitCode: 1, stdout: "", stderrTail: "network down" }
    }
    await makeEnsurePython({ home: dir, runProcess: failing })(uvTool, ["3.12.3"])
    await makeEnsurePython({ home: dir, runProcess: failing })(uvTool, ["3.12.3"])

    expect(commands).toHaveLength(2)
  })
})

test("an installer that cannot start fails cleanly", async () => {
  await withTempDir(async (dir) => {
    const runProcess: ProcessRunner = async () => {
      throw new Error("spawn /tools/uv ENOENT")
    }

    const result = await makeEnsurePython({ home: dir, runProcess })(uvTool, ["3.12.3"])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("python_unavailable")
    expect(result.error.detail).toContain("/tools/uv")
  })
})

test("the user's own UV_ variables never reach the uv child", async () => {
  await withTempDir(async (dir) => {
    const previous = {
      index: process.env.UV_INDEX_URL,
      python: process.env.UV_PYTHON,
    }
    process.env.UV_INDEX_URL = "https://example.invalid/simple"
    process.env.UV_PYTHON = "/usr/bin/python3.9"
    try {
      const runs: Run[] = []
      const runProcess: ProcessRunner = async (command, _cwd, _onLine, env) => {
        runs.push({ command, env })
        return { exitCode: 0, stdout: "", stderrTail: "" }
      }

      const result = await makeEnsurePython({ home: dir, runProcess })(uvTool, ["3.12.3"])

      expect(result.ok).toBe(true)
      expect(runs[0]?.env?.UV_INDEX_URL).toBeUndefined()
      expect(runs[0]?.env?.UV_PYTHON).toBeUndefined()
      expect(runs[0]?.env?.UV_PYTHON_INSTALL_DIR).toBe(join(dir, "tools", "python"))
    } finally {
      if (previous.index === undefined) delete process.env.UV_INDEX_URL
      else process.env.UV_INDEX_URL = previous.index
      if (previous.python === undefined) delete process.env.UV_PYTHON
      else process.env.UV_PYTHON = previous.python
    }
  })
})

test("a stamp that cannot be written fails loudly instead of half-succeeding", async () => {
  await withTempDir(async (dir) => {
    const installDir = managedPythonDir(dir)
    await mkdir(installDir, { recursive: true })
    await chmod(installDir, 0o555)
    try {
      const runProcess: ProcessRunner = async () => ({
        exitCode: 0,
        stdout: "",
        stderrTail: "",
      })

      const result = await makeEnsurePython({ home: dir, runProcess })(uvTool, ["3.12.3"])

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe("python_unavailable")
      expect(result.error.detail).toContain("could not stamp 3.12.3")
    } finally {
      await chmod(installDir, 0o755)
    }
  })
})

const requestFor = (dir: string, fingerprint = venvFingerprint(venvPin)): VenvRequest => ({
  name: venvPin.name,
  dir,
  pythonVersion: venvPin.python,
  indexUrl: venvPin.indexUrl,
  extraIndexUrl: venvPin.extraIndexUrl,
  packages: venvPin.packages,
  fingerprint,
})

test("builds the venv then installs the pinned packages", async () => {
  await withTempDir(async (dir) => {
    const venvDir = join(dir, "venvs", "python")
    const runs: Run[] = []
    const runProcess: ProcessRunner = async (command, _cwd, _onLine, env) => {
      runs.push({ command, env })
      if (command[1] === "venv") {
        await mkdir(join(venvDir, "bin"), { recursive: true })
        await writeFile(join(venvDir, "bin", "python"), "", "utf8")
      }
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const ensureVenv = makeEnsureVenv({ home: dir, runProcess })
    const request = requestFor(venvDir)

    const result = await ensureVenv(uvTool, request)

    expect(result).toEqual({ ok: true, value: { status: "installed" } })
    expect(runs.map((run) => [...run.command])).toEqual([
      ["/tools/uv", "venv", "--python", "3.12.3", venvDir],
      [
        "/tools/uv",
        "pip",
        "install",
        "--python",
        join(venvDir, "bin", "python"),
        "--index-url",
        "https://pypi.org/simple",
        "--extra-index-url",
        "https://download.pytorch.org/whl/cu128",
        ...venvPin.packages,
      ],
    ])
    const pythonDir = join(dir, "tools", "python")
    const cacheDir = join(dir, "tools", "cache")
    expect(runs.every((run) => run.env?.UV_PYTHON_INSTALL_DIR === pythonDir)).toBe(true)
    expect(runs.every((run) => run.env?.UV_CACHE_DIR === cacheDir)).toBe(true)
    const stamp = JSON.parse(await readFile(join(venvDir, ".yuekbox.json"), "utf8")) as {
      fingerprint: string
    }
    expect(stamp.fingerprint).toBe(request.fingerprint)
  })
})

test("a current venv is ready and runs nothing", async () => {
  await withTempDir(async (dir) => {
    const venvDir = join(dir, "venvs", "python")
    const first = async (command: readonly string[]) => {
      if (command[1] === "venv") {
        await mkdir(join(venvDir, "bin"), { recursive: true })
      }
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    await makeEnsureVenv({ home: dir, runProcess: first })(uvTool, requestFor(venvDir))

    const second = await makeEnsureVenv({ home: dir, runProcess: neverRun })(
      uvTool,
      requestFor(venvDir),
    )

    expect(second).toEqual({ ok: true, value: { status: "ready" } })
  })
})

test("a changed fingerprint rebuilds the venv", async () => {
  await withTempDir(async (dir) => {
    const venvDir = join(dir, "venvs", "python")
    const commands: string[][] = []
    const runProcess: ProcessRunner = async (command) => {
      commands.push([...command])
      if (command[1] === "venv") {
        await mkdir(join(venvDir, "bin"), { recursive: true })
      }
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }
    const ensureVenv = makeEnsureVenv({ home: dir, runProcess })
    await ensureVenv(uvTool, requestFor(venvDir))
    const rebuilt = await ensureVenv(uvTool, requestFor(venvDir, "different-pins"))

    expect(rebuilt).toEqual({ ok: true, value: { status: "installed" } })
    expect(commands.filter((command) => command[1] === "venv")).toHaveLength(2)
  })
})

test("a corrupt stamp rebuilds the venv", async () => {
  await withTempDir(async (dir) => {
    const venvDir = join(dir, "venvs", "python")
    await mkdir(venvDir, { recursive: true })
    await writeFile(join(venvDir, ".yuekbox.json"), "not json", "utf8")
    const commands: string[][] = []
    const runProcess: ProcessRunner = async (command) => {
      commands.push([...command])
      if (command[1] === "venv") {
        await mkdir(join(venvDir, "bin"), { recursive: true })
      }
      return { exitCode: 0, stdout: "", stderrTail: "" }
    }

    const result = await makeEnsureVenv({ home: dir, runProcess })(uvTool, requestFor(venvDir))

    expect(result).toEqual({ ok: true, value: { status: "installed" } })
    expect(commands.filter((command) => command[1] === "venv")).toHaveLength(1)
  })
})

test("a failed package install leaves no stamp so a retry redoes the venv", async () => {
  await withTempDir(async (dir) => {
    const venvDir = join(dir, "venvs", "python")
    const commands: string[][] = []
    const runProcess: ProcessRunner = async (command) => {
      commands.push([...command])
      if (command[1] === "venv") {
        await mkdir(join(venvDir, "bin"), { recursive: true })
        return { exitCode: 0, stdout: "", stderrTail: "" }
      }
      return { exitCode: 2, stdout: "", stderrTail: "error: no matching torch==2.10.0" }
    }
    const ensureVenv = makeEnsureVenv({ home: dir, runProcess })

    const first = await ensureVenv(uvTool, requestFor(venvDir))

    expect(first.ok).toBe(false)
    if (first.ok) return
    expect(first.error.kind).toBe("venv_failed")
    expect(first.error.detail).toContain("no matching torch")
    expect(existsSync(join(venvDir, ".yuekbox.json"))).toBe(false)

    await ensureVenv(uvTool, requestFor(venvDir))

    expect(commands.filter((command) => command[1] === "venv")).toHaveLength(2)
  })
})

test("a venv command that cannot start fails cleanly", async () => {
  await withTempDir(async (dir) => {
    const runProcess: ProcessRunner = async () => {
      throw new Error("spawn /tools/uv ENOENT")
    }

    const result = await makeEnsureVenv({ home: dir, runProcess })(
      uvTool,
      requestFor(join(dir, "venvs", "python")),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("venv_failed")
    expect(result.error.detail).toContain("/tools/uv")
  })
})

test("a package install that cannot start fails cleanly", async () => {
  await withTempDir(async (dir) => {
    const venvDir = join(dir, "venvs", "python")
    const runProcess: ProcessRunner = async (command) => {
      if (command[1] === "venv") {
        await mkdir(join(venvDir, "bin"), { recursive: true })
        return { exitCode: 0, stdout: "", stderrTail: "" }
      }
      throw new Error("spawn /tools/uv ENOENT")
    }

    const result = await makeEnsureVenv({ home: dir, runProcess })(uvTool, requestFor(venvDir))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("venv_failed")
    expect(existsSync(join(venvDir, ".yuekbox.json"))).toBe(false)
  })
})
