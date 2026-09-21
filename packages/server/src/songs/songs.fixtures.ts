import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { ok } from "../shared/result"
import { songFolderName, songFolderSlug, songTitleFromLyrics } from "./songs.files"
import { SongsCapabilities, SongsSlice } from "./songs.assembly"
import { Reference, Song } from "./songs.models"

export const songFixture = (overrides: Partial<Song> = {}): Song =>
  Object.freeze({
    id: "01J8K3R4P9ABCDEFGHJKMNPQRS",
    status: "queued",
    stage: null,
    stageCompleted: null,
    stageTotal: null,
    lyrics: "hello",
    title: "hello",
    style: "pop",
    seed: 1,
    cot: "full",
    reference: null,
    scoreAbc: null,
    calibration: null,
    durationSeconds: null,
    truncatedAbc: null,
    truncatedSemantic: null,
    errorDetail: null,
    createdAt: "2026-09-17T04:00:00.000Z",
    updatedAt: "2026-09-17T04:00:00.000Z",
    completedAt: null,
    ...overrides,
  })

export const referenceFixture = (overrides: Partial<Reference> = {}): Reference =>
  Object.freeze({
    id: "01J8K3R4P9ABCDEFGHJKMNPQRT",
    filename: "demo-song.mp3",
    contentType: "audio/mpeg",
    byteLength: 4,
    createdAt: "2026-09-17T04:00:00.000Z",
    ...overrides,
  })

export const makeSongsCapabilitiesFixture = (
  overrides: Partial<SongsCapabilities> = {},
): SongsCapabilities => ({
  claimNextQueuedSong: async () => null,
  markSongRunning: async () => {},
  markSongStage: async () => {},
  markSongProgress: async () => {},
  markSongFailed: async () => {},
  findReferenceBySongId: async () => null,
  saveReferenceScore: async () => {},
  completeSong: async () => {},
  ...overrides,
})

export const makeSongsSliceFixture = (overrides: Partial<SongsSlice> = {}): SongsSlice => ({
  createSong: async () => ok(songFixture()),
  createReference: async () => ok(referenceFixture()),
  listSongs: async () =>
    ok({ items: [], limit: 20, nextCursor: null, previousCursor: null, count: 0 }),
  getSong: async () => ok(songFixture()),
  deleteSong: async () => ok(null),
  getSongAudio: async () =>
    ok({ contentType: "audio/mpeg", byteLength: 0, read: async () => new Uint8Array() }),
  findSongById: async () => null,
  readVisualizationFile: async () => null,
  writeVisualizationFile: async () => 0,
  queueDepth: async () => 0,
  recoverInterruptedSongs: async () => 0,
  capabilities: makeSongsCapabilitiesFixture(),
  ...overrides,
})

export const songFolderKey = (lyrics: string, songId: string): string =>
  songFolderName(songFolderSlug(songTitleFromLyrics(lyrics)), songId)

export const writeMediaFile = async (
  mediaDir: string,
  key: string,
  bytes: Uint8Array | string,
): Promise<string> => {
  const path = join(mediaDir, key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
  return path
}
