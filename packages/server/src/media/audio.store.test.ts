import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeFsAudioStore } from "./audio.store"

const withStore = async (
  run: (store: ReturnType<typeof makeFsAudioStore>, mediaDir: string) => Promise<void>,
): Promise<void> => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-media-test-"))
  try {
    await run(makeFsAudioStore(mediaDir), mediaDir)
  } finally {
    await rm(mediaDir, { recursive: true, force: true })
  }
}

test("put writes the bytes at the deterministic path and leaves no temp file", async () => {
  await withStore(async (store, mediaDir) => {
    const stored = await store.put("songs/one.mp3", new Uint8Array([1, 2, 3]))

    expect(stored.path).toBe(join(mediaDir, "songs/one.mp3"))
    expect(stored.byteLength).toBe(3)
    expect(Array.from((await store.read("songs/one.mp3")) ?? [])).toEqual([1, 2, 3])
    expect(await readdir(join(mediaDir, "songs"))).toEqual(["one.mp3"])
  })
})

test("put replaces an existing file with the new bytes", async () => {
  await withStore(async (store) => {
    await store.put("songs/one.mp3", new Uint8Array([1, 2, 3]))
    await store.put("songs/one.mp3", new Uint8Array([9, 9]))

    expect(Array.from((await store.read("songs/one.mp3")) ?? [])).toEqual([9, 9])
    expect((await store.stat("songs/one.mp3"))?.byteLength).toBe(2)
  })
})

test("stat reports the byte length and null for a missing key", async () => {
  await withStore(async (store) => {
    await store.put("references/one.wav", new Uint8Array([1, 2, 3, 4]))

    expect((await store.stat("references/one.wav"))?.byteLength).toBe(4)
    expect(await store.stat("references/missing.wav")).toBeNull()
  })
})

test("read returns null for a missing key", async () => {
  await withStore(async (store) => {
    expect(await store.read("songs/missing.mp3")).toBeNull()
  })
})

test("openRange reads only the requested bytes from a large file", async () => {
  await withStore(async (store) => {
    const large = Uint8Array.from({ length: 5 * 1024 * 1024 }, (_, index) => index % 251)
    await store.put("songs/large.mp3", large)

    const start = 1_000_000
    const end = 1_000_099
    const slice = await store.openRange("songs/large.mp3", start, end)

    expect(slice?.byteLength).toBe(100)
    expect(Array.from(slice ?? [])).toEqual(Array.from(large.subarray(start, end + 1)))
    expect(await store.openRange("songs/missing.mp3", 0, 9)).toBeNull()
  })
})

test("openRange returns null when the file is shorter than the range", async () => {
  await withStore(async (store) => {
    await store.put("songs/short.mp3", new Uint8Array([1, 2, 3]))

    expect(await store.openRange("songs/short.mp3", 0, 9)).toBeNull()
  })
})

test("store paths resolve under the media root", async () => {
  await withStore(async (store, mediaDir) => {
    expect(store.path("songs/one.mp3")).toBe(join(mediaDir, "songs/one.mp3"))
  })
})

test("remove deletes the file and tolerates a missing key", async () => {
  await withStore(async (store) => {
    await store.put("songs/one.mp3", new Uint8Array([1, 2, 3]))

    await store.remove("songs/one.mp3")
    expect(await store.stat("songs/one.mp3")).toBeNull()
    await store.remove("songs/one.mp3")
  })
})

test("move renames a file onto a new key", async () => {
  await withStore(async (store) => {
    await store.put("references/one.mp3", new Uint8Array([1, 2, 3]))

    await store.move("references/one.mp3", "references/amazing-song_one.mp3")

    expect(await store.stat("references/one.mp3")).toBeNull()
    expect(Array.from((await store.read("references/amazing-song_one.mp3")) ?? [])).toEqual([
      1, 2, 3,
    ])
  })
})

test("move fails when the source does not exist", async () => {
  await withStore(async (store) => {
    const outcome = await store.move("references/missing.mp3", "references/one.mp3").then(
      () => "moved",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )

    expect(outcome).not.toBe("moved")
    expect(await store.stat("references/one.mp3")).toBeNull()
  })
})

test("list returns every stored key under the media root", async () => {
  await withStore(async (store) => {
    await store.put("songs/one.mp3", new Uint8Array([1]))
    await store.put("references/two.mp3", new Uint8Array([2]))

    expect((await store.list()).toSorted()).toEqual(["references/two.mp3", "songs/one.mp3"])
  })
})
