import { expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const sheetsage2Tools = fileURLToPath(new URL("../../tools/sheetsage2/", import.meta.url))

const classFromSnapshot = (modelDir: string, homeDir: string): string => {
  const result = Bun.spawnSync(
    [
      "python3",
      "-c",
      [
        "import os",
        "from pathlib import Path",
        "import sys",
        `os.environ["HOME"] = ${JSON.stringify(homeDir)}`,
        `sys.path.insert(0, ${JSON.stringify(sheetsage2Tools)})`,
        "from transcribe import class_from_local_snapshot",
        `cls = class_from_local_snapshot(Path(${JSON.stringify(modelDir)}))`,
        "print(cls.marker)",
      ].join("\n"),
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString() || `python exited ${result.exitCode}`)
  }
  return result.stdout.toString().trim()
}

test("custom model code loads from the snapshot even when transformers_modules is stale", async () => {
  const root = await mkdtemp(join(tmpdir(), "sheetsage2-local-"))
  const model = join(root, "SheetSage2")
  const home = join(root, "home")
  const stale = join(home, ".cache/huggingface/modules/transformers_modules/SheetSage2")
  await mkdir(model)
  await mkdir(stale, { recursive: true })
  await writeFile(
    join(model, "config.json"),
    JSON.stringify({ auto_map: { AutoModel: "modeling_toy.ToyModel" } }),
  )
  await writeFile(join(model, "sibling_toy.py"), "VALUE = 'snapshot'\n")
  await writeFile(
    join(model, "modeling_toy.py"),
    "from .sibling_toy import VALUE\nclass ToyModel:\n    marker = VALUE\n",
  )
  await writeFile(join(stale, "sibling_toy.py"), "VALUE = 'stale-cache'\n")
  await writeFile(
    join(stale, "modeling_toy.py"),
    "from .sibling_toy import VALUE\nclass ToyModel:\n    marker = VALUE\n",
  )

  expect(classFromSnapshot(model, home)).toBe("snapshot")
})
