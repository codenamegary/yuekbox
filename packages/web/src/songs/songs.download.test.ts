import { expect, test } from "bun:test"
import { mp3FileName, songDownloadHref } from "./songs.download"

const songId = "01J8K3R4P9ABCDEFGHJKMNPQRS"

test("download href points at the song audio route", () => {
  expect(songDownloadHref(songId)).toBe(`/v1/songs/${songId}/audio`)
})

test("download filename namespaces the song id as an mp3", () => {
  expect(mp3FileName(songId)).toBe(`yuekbox-${songId}.mp3`)
})
