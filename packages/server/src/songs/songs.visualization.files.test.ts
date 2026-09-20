import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openDatabase } from "../db/client"
import { assembleMediaSlice } from "../media/media.assembly"
import { assembleSongsSlice, SongsSlice } from "./songs.assembly"
import { songFolderKey } from "./songs.fixtures"
import { visualizationFileName } from "./songs.files"

const code =
  "(host) => ({ resize() {}, renderAudioFrame() {}, renderLyricFrame() {}, dispose() {} })"

const withSongs = async (run: (songs: SongsSlice, mediaDir: string) => Promise<void>) => {
  const mediaDir = await mkdtemp(join(tmpdir(), "yuekbox-visualization-test-"))
  const handle = openDatabase({ path: ":memory:" })
  try {
    const songs = assembleSongsSlice({ db: handle.db, media: assembleMediaSlice(mediaDir) })
    await run(songs, mediaDir)
  } finally {
    handle.close()
    await rm(mediaDir, { recursive: true, force: true })
  }
}

test("a visualization round-trips through visualization.js in the song folder", async () => {
  await withSongs(async (songs, mediaDir) => {
    const created = await songs.createSong({ lyrics: "hello world", style: "pop" })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const byteLength = await songs.writeVisualizationFile(created.value.id, code)

    expect(byteLength).toBe(Buffer.byteLength(code))
    expect(await songs.readVisualizationFile(created.value.id)).toBe(code)
    const path = join(
      mediaDir,
      songFolderKey("hello world", created.value.id),
      visualizationFileName,
    )
    expect(existsSync(path)).toBe(true)
    expect(await readFile(path, "utf8")).toBe(code)
  })
})

test("reading a Song with no visualization returns null", async () => {
  await withSongs(async (songs) => {
    const created = await songs.createSong({ lyrics: "hello world", style: "pop" })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(await songs.readVisualizationFile(created.value.id)).toBeNull()
  })
})

test("writing a visualization without a folder throws instead of dropping the code", async () => {
  await withSongs(async (songs) => {
    const outcome = await songs.writeVisualizationFile("01J8K3R4P9ABCDEFGHJKMNPQRS", code).then(
      () => "resolved",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )

    expect(outcome).toContain("song folder is missing")
  })
})
