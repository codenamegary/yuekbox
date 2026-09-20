import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  makeFindFiles,
  makeMakeDirectory,
  makeMoveFile,
  makeOpenFileRange,
  makePutFile,
  makeReadFile,
  makeRemoveDirectory,
  makeRemoveFile,
  makeStatFile,
} from "./media.adapters"

const withMediaDir = async (run: (mediaDir: string) => Promise<void>): Promise<void> => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-media-test-"))
  try {
    await run(mediaDir)
  } finally {
    await rm(mediaDir, { recursive: true, force: true })
  }
}

test("put writes the bytes at the key and leaves no temp file", async () => {
  await withMediaDir(async (mediaDir) => {
    const byteLength = await makePutFile(mediaDir)("songs/one.mp3", new Uint8Array([1, 2, 3]))

    expect(byteLength).toBe(3)
    expect(Array.from((await makeReadFile(mediaDir)("songs/one.mp3")) ?? [])).toEqual([1, 2, 3])
    expect(await readdir(join(mediaDir, "songs"))).toEqual(["one.mp3"])
  })
})

test("put replaces an existing file with the new bytes", async () => {
  await withMediaDir(async (mediaDir) => {
    const putFile = makePutFile(mediaDir)
    const readFile = makeReadFile(mediaDir)
    const statFile = makeStatFile(mediaDir)
    await putFile("songs/one.mp3", new Uint8Array([1, 2, 3]))
    await putFile("songs/one.mp3", new Uint8Array([9, 9]))

    expect(Array.from((await readFile("songs/one.mp3")) ?? [])).toEqual([9, 9])
    expect((await statFile("songs/one.mp3"))?.byteLength).toBe(2)
  })
})

test("stat reports the path and byte length, and null for a missing key", async () => {
  await withMediaDir(async (mediaDir) => {
    await makePutFile(mediaDir)("references/one.wav", new Uint8Array([1, 2, 3, 4]))
    const statFile = makeStatFile(mediaDir)

    const stored = await statFile("references/one.wav")
    expect(stored?.byteLength).toBe(4)
    expect(stored?.path).toBe(join(mediaDir, "references/one.wav"))
    expect(await statFile("references/missing.wav")).toBeNull()
  })
})

test("read returns null for a missing key", async () => {
  await withMediaDir(async (mediaDir) => {
    expect(await makeReadFile(mediaDir)("songs/missing.mp3")).toBeNull()
  })
})

test("openRange reads only the requested bytes from a large file", async () => {
  await withMediaDir(async (mediaDir) => {
    const large = Uint8Array.from({ length: 5 * 1024 * 1024 }, (_, index) => index % 251)
    await makePutFile(mediaDir)("songs/large.mp3", large)
    const openFileRange = makeOpenFileRange(mediaDir)

    const start = 1_000_000
    const end = 1_000_099
    const slice = await openFileRange("songs/large.mp3", start, end)

    expect(slice?.byteLength).toBe(100)
    expect(Array.from(slice ?? [])).toEqual(Array.from(large.subarray(start, end + 1)))
    expect(await openFileRange("songs/missing.mp3", 0, 9)).toBeNull()
  })
})

test("openRange returns null when the file is shorter than the range", async () => {
  await withMediaDir(async (mediaDir) => {
    await makePutFile(mediaDir)("songs/short.mp3", new Uint8Array([1, 2, 3]))

    expect(await makeOpenFileRange(mediaDir)("songs/short.mp3", 0, 9)).toBeNull()
  })
})

test("makeDirectory creates the folder and every parent", async () => {
  await withMediaDir(async (mediaDir) => {
    await makeMakeDirectory(mediaDir)("amazing-song_01J8K3R4P9ABCDEFGHJKMNPQRS/references")
    await makeMakeDirectory(mediaDir)("amazing-song_01J8K3R4P9ABCDEFGHJKMNPQRS/references")

    expect(await readdir(mediaDir)).toEqual(["amazing-song_01J8K3R4P9ABCDEFGHJKMNPQRS"])
  })
})

test("move renames a file onto a new key", async () => {
  await withMediaDir(async (mediaDir) => {
    const putFile = makePutFile(mediaDir)
    const readFile = makeReadFile(mediaDir)
    const statFile = makeStatFile(mediaDir)
    await putFile("temp/one.mp3", new Uint8Array([1, 2, 3]))

    await makeMoveFile(mediaDir)("temp/one.mp3", "amazing-song_01J/references/one.mp3")

    expect(await statFile("temp/one.mp3")).toBeNull()
    expect(Array.from((await readFile("amazing-song_01J/references/one.mp3")) ?? [])).toEqual([
      1, 2, 3,
    ])
  })
})

test("move fails when the source does not exist", async () => {
  await withMediaDir(async (mediaDir) => {
    const outcome = await makeMoveFile(mediaDir)(
      "references/missing.mp3",
      "references/one.mp3",
    ).then(
      () => "moved",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )

    expect(outcome).not.toBe("moved")
    expect(await makeStatFile(mediaDir)("references/one.mp3")).toBeNull()
  })
})

test("remove deletes the file and tolerates a missing key", async () => {
  await withMediaDir(async (mediaDir) => {
    const putFile = makePutFile(mediaDir)
    const removeFile = makeRemoveFile(mediaDir)
    const statFile = makeStatFile(mediaDir)
    await putFile("songs/one.mp3", new Uint8Array([1, 2, 3]))

    await removeFile("songs/one.mp3")
    expect(await statFile("songs/one.mp3")).toBeNull()
    await removeFile("songs/one.mp3")
  })
})

test("removeDirectory removes the folder and everything below it", async () => {
  await withMediaDir(async (mediaDir) => {
    const putFile = makePutFile(mediaDir)
    const find = makeFindFiles(mediaDir)
    await putFile("amazing-song_01J/generated_01J.mp3", new Uint8Array([1]))
    await putFile("amazing-song_01J/references/demo_02J.mp3", new Uint8Array([2]))
    await putFile("other-song_03J/generated_03J.mp3", new Uint8Array([3]))

    await makeRemoveDirectory(mediaDir)("amazing-song_01J")
    await makeRemoveDirectory(mediaDir)("missing-folder_04J")

    expect(await find("*")).toEqual(["other-song_03J"])
    expect(await find("*/*")).toEqual(["other-song_03J/generated_03J.mp3"])
  })
})

test("find matches a single segment pattern across the root", async () => {
  await withMediaDir(async (mediaDir) => {
    const putFile = makePutFile(mediaDir)
    await putFile("amazing-song_01J/generated_01J.mp3", new Uint8Array([1]))
    await putFile("other-song_02J/generated_02J.mp3", new Uint8Array([2]))

    expect(await makeFindFiles(mediaDir)("*_01J")).toEqual(["amazing-song_01J"])
    expect(await makeFindFiles(mediaDir)("*")).toEqual(["amazing-song_01J", "other-song_02J"])
    expect(await makeFindFiles(mediaDir)("missing_03J")).toEqual([])
  })
})

test("find returns files and directories below a matched segment", async () => {
  await withMediaDir(async (mediaDir) => {
    const putFile = makePutFile(mediaDir)
    await putFile("amazing-song_01J/references/demo-song_02J.mp3", new Uint8Array([1]))

    expect(await makeFindFiles(mediaDir)("amazing-song_01J/*")).toEqual([
      "amazing-song_01J/references",
    ])
    expect(await makeFindFiles(mediaDir)("amazing-song_01J/references/*")).toEqual([
      "amazing-song_01J/references/demo-song_02J.mp3",
    ])
    expect(await makeFindFiles(mediaDir)("temp/*_02J.*")).toEqual([])
  })
})

test("find rejects patterns that escape the media root", async () => {
  await withMediaDir(async (mediaDir) => {
    const find = makeFindFiles(mediaDir)

    for (const pattern of ["", "/abs", "..", "a/../b", "a//b", "a/./b"]) {
      const outcome = await find(pattern).then(
        () => "resolved",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      )
      expect(outcome).toContain("invalid media pattern")
    }
  })
})
