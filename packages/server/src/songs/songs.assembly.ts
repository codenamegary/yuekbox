import { ulid } from "ulid"
import { Db } from "../db/client"
import { MediaSlice } from "../media/media.assembly"
import { StoredFile } from "../media/media.ports"
import { Result } from "../shared/result"
import { makeCreateReference } from "./references.usecase"
import { makeGetSongAudio } from "./songs.audio.usecase"
import { makeCompleteSong } from "./songs.complete.usecase"
import { makeCreateSong } from "./songs.create.usecase"
import { makeDeleteSong } from "./songs.delete.usecase"
import {
  generatedAudioKey,
  parseReferenceFileName,
  referenceFileKey,
  referenceFilesPattern,
  scoreKey,
  songFolderName,
  songFolderPattern,
  songTitleFromLyrics,
  visualizationKey,
} from "./songs.files"
import { makeGetSong } from "./songs.get.usecase"
import { ListSongsInput, makeListSongs } from "./songs.list.usecase"
import { makeSaveReferenceScore } from "./songs.reference.score.usecase"
import {
  ByteRange,
  CreateReferenceError,
  CreateReferenceInput,
  DeleteSongError,
  GetSongError,
  ListSongsError,
  Reference,
  Song,
  SongAudioLookupError,
  SongAudioPayload,
  SongReference,
  SongsPage,
} from "./songs.models"
import {
  ClaimNextQueuedSong,
  CompleteSong,
  CreateSong,
  FindReferenceBySongId,
  FindSongById,
  MarkSongFailed,
  MarkSongProgress,
  MarkSongRunning,
  MarkSongStage,
  SaveReferenceScore,
} from "./songs.ports"
import {
  makeClaimNextQueuedSong,
  makeDeleteSong as makeDeleteSongAdapter,
  makeFindSongById,
  makeInsertSong,
  makeListSongs as makeListSongsAdapter,
  makeMarkSongComplete,
  makeMarkSongFailed,
  makeMarkSongProgress,
  makeMarkSongRunning,
  makeMarkSongStage,
  makeRecoverInterruptedSongs,
} from "./songs.sqlite.adapters"

export type SongsSliceDeps = Readonly<{
  db: Db
  media: MediaSlice
  now?: () => string
  logError?: (message: string, error: unknown) => void
  /** Fired after a Song insert; compose wires it to the visualizations slice. */
  onSongQueued?: (songId: string) => void
}>

export type SongsCapabilities = Readonly<{
  claimNextQueuedSong: ClaimNextQueuedSong
  markSongRunning: MarkSongRunning
  markSongStage: MarkSongStage
  markSongProgress: MarkSongProgress
  markSongFailed: MarkSongFailed
  findReferenceBySongId: FindReferenceBySongId
  saveReferenceScore: SaveReferenceScore
  completeSong: CompleteSong
}>

export type SongsSlice = Readonly<{
  createSong: CreateSong
  createReference: (input: CreateReferenceInput) => Promise<Result<Reference, CreateReferenceError>>
  listSongs: (input: ListSongsInput) => Promise<Result<SongsPage, ListSongsError>>
  getSong: (songId: string) => Promise<Result<Song, GetSongError>>
  deleteSong: (songId: string) => Promise<Result<null, DeleteSongError>>
  getSongAudio: (songId: string) => Promise<Result<SongAudioPayload, SongAudioLookupError>>
  findSongById: FindSongById
  readVisualizationFile: (songId: string) => Promise<string | null>
  writeVisualizationFile: (songId: string, code: string) => Promise<number>
  queueDepth: () => Promise<number>
  recoverInterruptedSongs: () => Promise<number>
  capabilities: SongsCapabilities
}>

export const assembleSongsSlice = (deps: SongsSliceDeps): SongsSlice => {
  const now = deps.now ?? (() => new Date().toISOString())
  const logError = deps.logError ?? ((message, error) => console.error(message, error))
  const media = deps.media

  const insertSong = makeInsertSong(deps.db)
  const findSongById = makeFindSongById(deps.db)
  const listSongsPort = makeListSongsAdapter(deps.db)
  const markSongRunning = makeMarkSongRunning(deps.db)
  const markSongStage = makeMarkSongStage(deps.db)
  const markSongProgress = makeMarkSongProgress(deps.db)
  const markSongComplete = makeMarkSongComplete(deps.db)
  const markSongFailed = makeMarkSongFailed(deps.db)
  const claimNextQueuedSong = makeClaimNextQueuedSong(deps.db)
  const deleteSongRow = makeDeleteSongAdapter(deps.db)
  const recoverInterruptedSongs = makeRecoverInterruptedSongs(deps.db)

  const findSongFolder = async (songId: string): Promise<string | null> => {
    const matches = await media.find(songFolderPattern(songId))
    return matches.find((key) => !key.includes("/")) ?? null
  }

  const resolveSongFolder = async (song: Song): Promise<string> => {
    const existing = await findSongFolder(song.id)
    return existing ?? songFolderName(songTitleFromLyrics(song.lyrics), song.id)
  }

  const findReferenceFileName = async (folderKey: string): Promise<string | null> => {
    const matches = await media.find(referenceFilesPattern(folderKey))
    const key = matches[0]
    return key === undefined ? null : key.slice(key.lastIndexOf("/") + 1)
  }

  const findReferenceSummary = async (songId: string): Promise<SongReference | null> => {
    const folderKey = await findSongFolder(songId)
    if (folderKey === null) return null
    const fileName = await findReferenceFileName(folderKey)
    if (fileName === null) return null
    const parts = parseReferenceFileName(fileName)
    return parts === null ? null : Object.freeze({ id: parts.id, filename: parts.displayName })
  }

  const findReferenceBySongId: FindReferenceBySongId = async (songId) => {
    const folderKey = await findSongFolder(songId)
    if (folderKey === null) return null
    const fileName = await findReferenceFileName(folderKey)
    if (fileName === null) return null
    const parts = parseReferenceFileName(fileName)
    if (parts === null) return null
    const stored = await media.statFile(referenceFileKey(folderKey, fileName))
    return Object.freeze({ referenceId: parts.id, audioPath: stored?.path ?? null })
  }

  const readScoreAbc = async (songId: string): Promise<string | null> => {
    const folderKey = await findSongFolder(songId)
    if (folderKey === null) return null
    const bytes = await media.readFile(scoreKey(folderKey))
    return bytes === null ? null : new TextDecoder().decode(bytes)
  }

  const readVisualizationFile = async (songId: string): Promise<string | null> => {
    const folderKey = await findSongFolder(songId)
    if (folderKey === null) return null
    const bytes = await media.readFile(visualizationKey(folderKey))
    return bytes === null ? null : new TextDecoder().decode(bytes)
  }

  const writeVisualizationFile = async (songId: string, code: string): Promise<number> => {
    const folderKey = await findSongFolder(songId)
    if (folderKey === null) throw new Error(`song folder is missing for ${songId}`)
    return media.putFile(visualizationKey(folderKey), new TextEncoder().encode(code))
  }

  const removeSongFolder = async (songId: string): Promise<void> => {
    const matches = await media.find(songFolderPattern(songId))
    await Promise.all(
      matches.filter((key) => !key.includes("/")).map((key) => media.removeDirectory(key)),
    )
  }

  const statSongAudio = async (song: Song): Promise<StoredFile | null> => {
    const folderKey = await findSongFolder(song.id)
    if (folderKey === null) return null
    return media.statFile(generatedAudioKey(folderKey, song.id))
  }

  const readSongAudio = async (song: Song, range: ByteRange | null): Promise<Uint8Array> => {
    const folderKey = await findSongFolder(song.id)
    if (folderKey === null) throw new Error(`song audio is missing for ${song.id}`)
    const key = generatedAudioKey(folderKey, song.id)
    const bytes =
      range === null
        ? await media.readFile(key)
        : await media.openFileRange(key, range.start, range.end)
    if (bytes === null) throw new Error(`song audio is missing at ${key}`)
    return bytes
  }

  const createSong = makeCreateSong({
    insertSong,
    deleteSong: deleteSongRow,
    makeDirectory: media.makeDirectory,
    moveFile: media.moveFile,
    removeDirectory: media.removeDirectory,
    find: media.find,
    now,
    generateId: () => ulid(),
    randomSeed: () => Math.floor(Math.random() * 2 ** 31),
    onSongQueued: deps.onSongQueued,
  })

  const createReference = makeCreateReference({
    putFile: media.putFile,
    now,
    generateId: () => ulid(),
  })

  const saveReferenceScore = makeSaveReferenceScore({
    findSongById,
    resolveSongFolder,
    putFile: media.putFile,
  })

  const completeSong = makeCompleteSong({
    findSongById,
    resolveSongFolder,
    putFile: media.putFile,
    removeFile: media.removeFile,
    markSongComplete,
  })

  const listSongs = makeListSongs({ listSongs: listSongsPort })
  const getSong = makeGetSong({ findSongById, readScoreAbc, findReferenceSummary })
  const deleteSong = makeDeleteSong({ deleteSong: deleteSongRow, removeSongFolder, logError })
  const getSongAudio = makeGetSongAudio({ findSongById, statSongAudio, readSongAudio })

  const queueDepth = async (): Promise<number> => {
    const page = await listSongsPort({ limit: 1, cursor: null, statuses: ["queued"] })
    return page.count
  }

  const capabilities: SongsCapabilities = Object.freeze({
    claimNextQueuedSong,
    markSongRunning,
    markSongStage,
    markSongProgress,
    markSongFailed,
    findReferenceBySongId,
    saveReferenceScore,
    completeSong,
  })

  return {
    createSong,
    createReference,
    listSongs,
    getSong,
    deleteSong,
    getSongAudio,
    findSongById,
    readVisualizationFile,
    writeVisualizationFile,
    queueDepth,
    recoverInterruptedSongs,
    capabilities,
  }
}
