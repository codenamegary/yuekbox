import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openDatabase } from "../db/client"
import { assembleMediaSlice } from "../media/media.assembly"
import { assembleSongsSlice, SongsSlice } from "./songs.assembly"
import { songFolderKey, writeMediaFile } from "./songs.fixtures"
import { visualizationFileName } from "./songs.files"

const code = "(host) => ({ resize() {}, renderAudioFrame() {}, dispose() {} })"

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

test("an analysis round-trips through analysis.json in the song folder", async () => {
  await withSongs(async (songs, mediaDir) => {
    const created = await songs.createSong({ lyrics: "hello world", style: "pop" })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const folder = songFolderKey("hello world", created.value.id)
    await writeMediaFile(
      mediaDir,
      `${folder}/analysis.json`,
      JSON.stringify({
        version: 1,
        source: "sheetsage2",
        notes: [{ startSeconds: 1, endSeconds: 1.5, pitch: 64 }],
        beats: [{ time: 0, position: 1, beatsPerBar: 4, beatUnit: 4 }],
        sections: [{ name: "intro", startSeconds: 0, endSeconds: 8 }],
      }),
    )

    const analysis = await songs.readAnalysisFile(created.value.id)

    expect(analysis?.notes).toHaveLength(1)
    expect(analysis?.sections[0]?.name).toBe("intro")
  })
})

test("a Song with no analysis file reads null, and malformed JSON reads null too", async () => {
  await withSongs(async (songs, mediaDir) => {
    const created = await songs.createSong({ lyrics: "hello world", style: "pop" })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(await songs.readAnalysisFile(created.value.id)).toBeNull()

    const folder = songFolderKey("hello world", created.value.id)
    await writeMediaFile(mediaDir, `${folder}/analysis.json`, "not json")

    expect(await songs.readAnalysisFile(created.value.id)).toBeNull()
  })
})

test("the raw transcript tree is copied under analysis/sheetsage2", async () => {
  await withSongs(async (songs, mediaDir) => {
    const created = await songs.createSong({ lyrics: "hello world", style: "pop" })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const sourceDir = await mkdtemp(join(tmpdir(), "yuekbox-transcript-"))
    await writeFile(join(sourceDir, "score.abc"), "X:1\nK:C\nC D E|", "utf8")
    await mkdir(join(sourceDir, "notation"), { recursive: true })
    await writeFile(join(sourceDir, "notation", "song_beats.txt"), "0 1 4 4\n", "utf8")

    await songs.saveTranscriptRaw(created.value.id, sourceDir)

    const folder = songFolderKey("hello world", created.value.id)
    expect(
      await readFile(join(mediaDir, folder, "analysis", "sheetsage2", "score.abc"), "utf8"),
    ).toBe("X:1\nK:C\nC D E|")
    expect(
      await readFile(
        join(mediaDir, folder, "analysis", "sheetsage2", "notation", "song_beats.txt"),
        "utf8",
      ),
    ).toBe("0 1 4 4\n")

    await rm(sourceDir, { recursive: true, force: true })
  })
})
