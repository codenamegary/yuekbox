import { expect, test } from "bun:test"
import {
  mediaIdFromFileName,
  parseMediaKey,
  referenceAudioKey,
  songAudioKey,
  songTitleFromLyrics,
} from "./audio.keys"

const id = "01M2S1S56CXT1N9PMTRNKA15WJ"

test("songTitleFromLyrics takes the first sung line and slugs it", () => {
  expect(songTitleFromLyrics("[Verse]\nAmazing Awesome Song\nSecond line here\n")).toBe(
    "amazing-awesome-song",
  )
  expect(songTitleFromLyrics("Amazing awesome song")).toBe("amazing-awesome-song")
  expect(songTitleFromLyrics("[Intro]\n\n  Don't Stop Me Now!  \n")).toBe("don-t-stop-me-now")
  expect(songTitleFromLyrics("Café del Mar")).toBe("cafe-del-mar")
})

test("songTitleFromLyrics falls back to untitled", () => {
  expect(songTitleFromLyrics("[Verse]\n[Chorus]\n")).toBe("untitled")
  expect(songTitleFromLyrics("")).toBe("untitled")
  expect(songTitleFromLyrics("!!! ???")).toBe("untitled")
})

test("songTitleFromLyrics caps the slug length", () => {
  const title = songTitleFromLyrics(`${"word ".repeat(40)}end`)
  expect(title.length).toBeLessThanOrEqual(60)
})

test("song keys carry the title prefix and the bare id form", () => {
  expect(songAudioKey(id, "amazing-awesome-song")).toBe(`songs/amazing-awesome-song_${id}.mp3`)
  expect(songAudioKey(id, null)).toBe(`songs/${id}.mp3`)
})

test("reference keys are bare on upload and titled after the song completes", () => {
  expect(referenceAudioKey(id, "audio/mpeg", null)).toBe(`references/${id}.mp3`)
  expect(referenceAudioKey(id, "audio/wav", "amazing-awesome-song")).toBe(
    `references/amazing-awesome-song_${id}.wav`,
  )
})

test("mediaIdFromFileName accepts a prefixed or bare ulid", () => {
  expect(mediaIdFromFileName(`amazing-awesome-song_${id}.mp3`)).toBe(id)
  expect(mediaIdFromFileName(`${id}.mp3`)).toBe(id)
  expect(mediaIdFromFileName(`title words - great song ${id}.mp3`)).toBe(id)
  expect(mediaIdFromFileName(`${id}.tmp`)).toBe(id)
  expect(mediaIdFromFileName("amazing-awesome-song.mp3")).toBeNull()
  expect(mediaIdFromFileName("notes.txt")).toBeNull()
})

test("a temp leftover is not a match, so reconcile unlinks it", () => {
  expect(mediaIdFromFileName(`${id}.mp3.tmp`)).toBeNull()
})

test("parseMediaKey splits the role directory from the id", () => {
  expect(parseMediaKey(`songs/amazing-awesome-song_${id}.mp3`)).toEqual({ role: "song", id })
  expect(parseMediaKey(`references/${id}.wav`)).toEqual({ role: "reference", id })
  expect(parseMediaKey(`covers/${id}.mp3`)).toBeNull()
  expect(parseMediaKey(`songs/notes.txt`)).toBeNull()
  expect(parseMediaKey(`songs/${id}.mp3.tmp`)).toBeNull()
})
