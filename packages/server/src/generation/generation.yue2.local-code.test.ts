import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

const yue2Tools = fileURLToPath(new URL("../../tools/yue2/", import.meta.url))
const sheetsage2Tools = fileURLToPath(new URL("../../tools/sheetsage2/", import.meta.url))

/** A native two-voice score: three Vocal notes over one bar, Ins resting. */
const nativeFixture = `X:1
T:
M:4/4
L:1/32
Q:1/4=96
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% verse
V: Vocal
"C"C8D8E16|
V: Ins
Z|
`

type Conversion = Readonly<{
  vocalSounding: number
  insNotes: readonly (readonly [string, number, string])[]
  tags: readonly string[]
  vocalBefore: number
}>

const convertFixture = (): Conversion => {
  const script = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(yue2Tools)})`,
    `sys.path.insert(0, ${JSON.stringify(sheetsage2Tools)})`,
    "from instrumentalize import convert_score",
    "from abc_tools import parse_abc",
    `converted, check = convert_score(${JSON.stringify(nativeFixture)})`,
    "score = parse_abc(converted)",
    "print(json.dumps({",
    '  "vocalSounding": len(score.voices["Vocal"].notes),',
    '  "insNotes": [[str(t), p, str(d)] for t, p, d in score.voices["Ins"].notes],',
    '  "tags": [line[2:] for line in converted.splitlines() if line.startswith("% ")],',
    '  "vocalBefore": check["vocal_notes_before"],',
    "}))",
  ].join("\n")
  const result = Bun.spawnSync(["python3", "-c", script], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString() || `python exited ${result.exitCode}`)
  }
  return JSON.parse(result.stdout.toString()) as Conversion
}

test("the vendored converter moves the vocal melody to Ins and empties Vocal", () => {
  const conversion = convertFixture()

  expect(conversion.vocalBefore).toBe(3)
  expect(conversion.vocalSounding).toBe(0)
  expect(conversion.insNotes).toEqual([
    ["0", 60, "1"],
    ["1", 62, "1"],
    ["2", 64, "2"],
  ])
  expect(conversion.tags).toEqual(["verse"])
})
