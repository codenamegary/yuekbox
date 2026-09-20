import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  makeAudioPath,
  makeListMediaFiles,
  makeMoveAudio,
  makeOpenAudioRange,
  makePutAudio,
  makeReadAudio,
  makeRemoveAudio,
  makeStatAudio,
} from "./songs.media.adapters"

const withMediaDir = async (run: (mediaDir: string) => Promise<void>): Promise<void> => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-media-test-"))
  try {
    await run(mediaDir)
  } finally {
    await rm(mediaDir, { recursive: true, force: true })
  }
}

test("put writes the bytes at the deterministic path and leaves no temp file", async () => {
  await withMediaDir(async (mediaDir) => {
    const putAudio = makePutAudio(mediaDir)
    const stored = await putAudio("songs/one.mp3", new Uint8Array([1, 2, 3]))

    expect(stored.path).toBe(join(mediaDir, "songs/one.mp3"))
    expect(stored.byteLength).toBe(3)
    expect(Array.from((await makeReadAudio(mediaDir)("songs/one.mp3")) ?? [])).toEqual([1, 2, 3])
    expect(await readdir(join(mediaDir, "songs"))).toEqual(["one.mp3"])
  })
})

test("put replaces an existing file with the new bytes", async () => {
  await withMediaDir(async (mediaDir) => {
    const putAudio = makePutAudio(mediaDir)
    const readAudio = makeReadAudio(mediaDir)
    const statAudio = makeStatAudio(mediaDir)
    await putAudio("songs/one.mp3", new Uint8Array([1, 2, 3]))
    await putAudio("songs/one.mp3", new Uint8Array([9, 9]))

    expect(Array.from((await readAudio("songs/one.mp3")) ?? [])).toEqual([9, 9])
    expect((await statAudio("songs/one.mp3"))?.byteLength).toBe(2)
  })
})

test("stat reports the byte length and null for a missing key", async () => {
  await withMediaDir(async (mediaDir) => {
    const putAudio = makePutAudio(mediaDir)
    const statAudio = makeStatAudio(mediaDir)
    await putAudio("references/one.wav", new Uint8Array([1, 2, 3, 4]))

    expect((await statAudio("references/one.wav"))?.byteLength).toBe(4)
    expect(await statAudio("references/missing.wav")).toBeNull()
  })
})

test("read returns null for a missing key", async () => {
  await withMediaDir(async (mediaDir) => {
    expect(await makeReadAudio(mediaDir)("songs/missing.mp3")).toBeNull()
  })
})

test("openRange reads only the requested bytes from a large file", async () => {
  await withMediaDir(async (mediaDir) => {
    const large = Uint8Array.from({ length: 5 * 1024 * 1024 }, (_, index) => index % 251)
    const putAudio = makePutAudio(mediaDir)
    const openAudioRange = makeOpenAudioRange(mediaDir)
    await putAudio("songs/large.mp3", large)

    const start = 1_000_000
    const end = 1_000_099
    const slice = await openAudioRange("songs/large.mp3", start, end)

    expect(slice?.byteLength).toBe(100)
    expect(Array.from(slice ?? [])).toEqual(Array.from(large.subarray(start, end + 1)))
    expect(await openAudioRange("songs/missing.mp3", 0, 9)).toBeNull()
  })
})

test("openRange returns null when the file is shorter than the range", async () => {
  await withMediaDir(async (mediaDir) => {
    const putAudio = makePutAudio(mediaDir)
    await putAudio("songs/short.mp3", new Uint8Array([1, 2, 3]))

    expect(await makeOpenAudioRange(mediaDir)("songs/short.mp3", 0, 9)).toBeNull()
  })
})

test("audioPath resolves under the media root", async () => {
  await withMediaDir(async (mediaDir) => {
    expect(makeAudioPath(mediaDir)("songs/one.mp3")).toBe(join(mediaDir, "songs/one.mp3"))
  })
})

test("move renames a file onto a new key", async () => {
  await withMediaDir(async (mediaDir) => {
    const putAudio = makePutAudio(mediaDir)
    const readAudio = makeReadAudio(mediaDir)
    const statAudio = makeStatAudio(mediaDir)
    await putAudio("references/one.mp3", new Uint8Array([1, 2, 3]))

    await makeMoveAudio(mediaDir)("references/one.mp3", "references/amazing-song_one.mp3")

    expect(await statAudio("references/one.mp3")).toBeNull()
    expect(Array.from((await readAudio("references/amazing-song_one.mp3")) ?? [])).toEqual([
      1, 2, 3,
    ])
  })
})

test("move fails when the source does not exist", async () => {
  await withMediaDir(async (mediaDir) => {
    const statAudio = makeStatAudio(mediaDir)
    const outcome = await makeMoveAudio(mediaDir)(
      "references/missing.mp3",
      "references/one.mp3",
    ).then(
      () => "moved",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )

    expect(outcome).not.toBe("moved")
    expect(await statAudio("references/one.mp3")).toBeNull()
  })
})

test("remove deletes the file and tolerates a missing key", async () => {
  await withMediaDir(async (mediaDir) => {
    const putAudio = makePutAudio(mediaDir)
    const removeAudio = makeRemoveAudio(mediaDir)
    const statAudio = makeStatAudio(mediaDir)
    await putAudio("songs/one.mp3", new Uint8Array([1, 2, 3]))

    await removeAudio("songs/one.mp3")
    expect(await statAudio("songs/one.mp3")).toBeNull()
    await removeAudio("songs/one.mp3")
  })
})

test("listMediaFiles returns every stored key under the media root", async () => {
  await withMediaDir(async (mediaDir) => {
    const putAudio = makePutAudio(mediaDir)
    const listMediaFiles = makeListMediaFiles(mediaDir)
    await putAudio("songs/one.mp3", new Uint8Array([1]))
    await putAudio("references/two.mp3", new Uint8Array([2]))

    expect((await listMediaFiles()).toSorted()).toEqual(["references/two.mp3", "songs/one.mp3"])
  })
})
