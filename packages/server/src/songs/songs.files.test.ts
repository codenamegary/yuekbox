import { expect, test } from "bun:test"
import {
  generatedAudioKey,
  generatedAudioFileName,
  parseReferenceFileName,
  referenceFileName,
  referenceFilesPattern,
  referenceScoreKey,
  referenceStemFromUpload,
  scoreKey,
  songFolderName,
  songFolderPattern,
  songIdFromFolderName,
  songTitleFromLyrics,
  uploadPattern,
} from "./songs.files"

const id = "01M2S1S56CXT1N9PMTRNKA15WJ"
const referenceId = "01M2S1S56CXT1N9PMTRNKA15WK"

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

test("a song folder is the title, an underscore, and the id", () => {
  expect(songFolderName("amazing-awesome-song", id)).toBe(`amazing-awesome-song_${id}`)
  expect(songFolderPattern(id)).toBe(`*_${id}`)
})

test("songIdFromFolderName parses a folder and ignores anything else", () => {
  expect(songIdFromFolderName(`amazing-awesome-song_${id}`)).toBe(id)
  expect(songIdFromFolderName("amazing-awesome-song")).toBeNull()
  expect(songIdFromFolderName("notes.txt")).toBeNull()
})

test("referenceStemFromUpload keeps the name, drops the extension, and makes it safe", () => {
  expect(referenceStemFromUpload("Demo Song.mp3")).toBe("Demo Song")
  expect(referenceStemFromUpload("demo.song.wav")).toBe("demo.song")
  expect(referenceStemFromUpload("no-extension")).toBe("no-extension")
  expect(referenceStemFromUpload("weird: name?.flac")).toBe("weird- name-")
  expect(referenceStemFromUpload(".hidden")).toBe("reference")
  expect(referenceStemFromUpload("   ")).toBe("reference")
})

test("referenceStemFromUpload caps the stem length", () => {
  const stem = referenceStemFromUpload(`${"a".repeat(300)}.wav`)
  expect(stem.length).toBeLessThanOrEqual(120)
})

test("referenceFileName appends the id and the canonical extension", () => {
  expect(referenceFileName("demo", referenceId, "audio/mpeg")).toBe(`demo_${referenceId}.mp3`)
  expect(referenceFileName("demo", referenceId, "audio/wav")).toBe(`demo_${referenceId}.wav`)
  expect(referenceFileName("demo", referenceId, "application/octet-stream")).toBe(
    `demo_${referenceId}.bin`,
  )
})

test("parseReferenceFileName recovers the id and the display name", () => {
  expect(parseReferenceFileName(`demo_${referenceId}.mp3`)).toEqual({
    id: referenceId,
    displayName: "demo.mp3",
  })
  expect(parseReferenceFileName(`Demo Song_${referenceId}.wav`)).toEqual({
    id: referenceId,
    displayName: "Demo Song.wav",
  })
  expect(parseReferenceFileName(`demo_${referenceId}`)).toEqual({
    id: referenceId,
    displayName: "demo",
  })
  expect(parseReferenceFileName("demo.mp3")).toBeNull()
  expect(parseReferenceFileName(`${referenceId}.mp3`)).toBeNull()
})

test("keys point inside the song folder", () => {
  const folder = `amazing-awesome-song_${id}`
  expect(generatedAudioFileName(id)).toBe(`generated_${id}.mp3`)
  expect(generatedAudioKey(folder, id)).toBe(`${folder}/generated_${id}.mp3`)
  expect(scoreKey(folder)).toBe(`${folder}/score.abc`)
  expect(referenceScoreKey(folder)).toBe(`${folder}/reference_score.abc`)
  expect(referenceFilesPattern(folder)).toBe(`${folder}/references/*`)
  expect(uploadPattern(referenceId)).toBe(`temp/*_${referenceId}.*`)
})
