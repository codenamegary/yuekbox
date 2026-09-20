import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CreateSongBody } from "contracts/http/songs"
import { ulid } from "ulid"
import { referenceAudioKey, songAudioKey } from "../media/audio.keys"
import { Db } from "../db/client"
import { err, ok, Result } from "../shared/result"
import { makeCreateReference } from "./references.usecase"
import { makeCreateSong } from "./songs.create.usecase"
import { makeDeleteSong } from "./songs.delete.usecase"
import { makeGetSong } from "./songs.get.usecase"
import { makeListSongs, ListSongsInput } from "./songs.list.usecase"
import {
  makePurgeStaleReferences,
  makeReconcileMedia,
  makeSaveSongAudio,
  ReconcileReport,
} from "./songs.media.usecase"
import {
  ByteRange,
  CreateReferenceError,
  CreateReferenceInput,
  CreateSongError,
  DeleteSongError,
  GetSongError,
  ListSongsError,
  Reference,
  Song,
  SongAudioLookupError,
  SongsPage,
} from "./songs.models"
import { AudioStore } from "./songs.ports"
import {
  makeAttachReferenceToSong,
  makeClaimNextQueuedSong,
  makeDeleteSong as makeDeleteSongAdapter,
  makeDeleteStaleReferences,
  makeFindReferenceById,
  makeFindReferenceBySongId,
  makeFindSongAudio,
  makeFindSongById,
  makeInsertReference,
  makeInsertSong,
  makeInsertSongAudio,
  makeListReferenceAudio,
  makeListSongAudio,
  makeListSongs as makeListSongsAdapter,
  makeMarkSongComplete,
  makeMarkSongFailed,
  makeMarkSongProgress,
  makeMarkSongRunning,
  makeMarkSongStage,
  makeRecoverInterruptedSongs,
  makeSaveReferenceScore,
} from "./songs.sqlite.adapters"
import { makeEncodeFlacToMp3, FfmpegAdapterEnv } from "./songs.ffmpeg.adapters"
import { makeRunTranscribe, Sheetsage2AdapterEnv } from "./songs.sheetsage2.adapters"
import { makeRunYue2Generate, Yue2AdapterEnv } from "./songs.yue2.adapters"
import { makeSongWorker, SongWorker } from "./songs.worker"

export type SongAudioPayload = Readonly<{
  contentType: string
  byteLength: number
  read: (range: ByteRange | null) => Promise<Uint8Array>
}>

export type SongsSliceDeps = Readonly<{
  db: Db
  audioStore: AudioStore
  yue2: Yue2AdapterEnv
  sheetsage2: Sheetsage2AdapterEnv
  ffmpeg: FfmpegAdapterEnv
  now?: () => string
  logError?: (message: string, error: unknown) => void
}>

export type SongsSlice = Readonly<{
  createSong: (body: CreateSongBody) => Promise<Result<Song, CreateSongError>>
  createReference: (input: CreateReferenceInput) => Promise<Result<Reference, CreateReferenceError>>
  purgeStaleReferences: (createdBefore: string) => Promise<number>
  listSongs: (input: ListSongsInput) => Promise<Result<SongsPage, ListSongsError>>
  getSong: (songId: string) => Promise<Result<Song, GetSongError>>
  deleteSong: (songId: string) => Promise<Result<null, DeleteSongError>>
  getSongAudio: (songId: string) => Promise<Result<SongAudioPayload, SongAudioLookupError>>
  recoverInterruptedSongs: () => Promise<number>
  reconcileMedia: () => Promise<ReconcileReport>
  queueDepth: () => Promise<number>
  worker: SongWorker
}>

export const assembleSongsSlice = (deps: SongsSliceDeps): SongsSlice => {
  const now = deps.now ?? (() => new Date().toISOString())
  const logError = deps.logError ?? ((message, error) => console.error(message, error))

  const insertSong = makeInsertSong(deps.db)
  const findSongById = makeFindSongById(deps.db)
  const insertReference = makeInsertReference(deps.db)
  const findReferenceById = makeFindReferenceById(deps.db)
  const findReferenceBySongId = makeFindReferenceBySongId(deps.db)
  const attachReferenceToSong = makeAttachReferenceToSong(deps.db)
  const saveReferenceScore = makeSaveReferenceScore(deps.db)
  const deleteStaleReferences = makeDeleteStaleReferences(deps.db)
  const findSongAudio = makeFindSongAudio(deps.db)
  const listSongsPort = makeListSongsAdapter(deps.db)
  const insertSongAudio = makeInsertSongAudio(deps.db)
  const listSongAudio = makeListSongAudio(deps.db)
  const listReferenceAudio = makeListReferenceAudio(deps.db)
  const markSongRunning = makeMarkSongRunning(deps.db)
  const markSongStage = makeMarkSongStage(deps.db)
  const markSongProgress = makeMarkSongProgress(deps.db)
  const markSongComplete = makeMarkSongComplete(deps.db)
  const markSongFailed = makeMarkSongFailed(deps.db)
  const claimNextQueuedSong = makeClaimNextQueuedSong(deps.db)
  const deleteSongRow = makeDeleteSongAdapter(deps.db)
  const recoverInterruptedSongs = makeRecoverInterruptedSongs(deps.db)

  const runYue2Generate = makeRunYue2Generate(deps.yue2)
  const runTranscribe = makeRunTranscribe(deps.sheetsage2)
  const encodeFlacToMp3 = makeEncodeFlacToMp3(deps.ffmpeg)

  const removeSongAudio = async (songId: string): Promise<void> => {
    await deps.audioStore.remove(songAudioKey(songId))
  }

  const removeReferenceAudio = async (referenceId: string, contentType: string): Promise<void> => {
    await deps.audioStore.remove(referenceAudioKey(referenceId, contentType))
  }

  const saveSongAudio = makeSaveSongAudio({
    putSongAudio: async (songId, mp3) =>
      (await deps.audioStore.put(songAudioKey(songId), mp3)).byteLength,
    insertSongAudio,
    removeSongAudio,
  })

  const purgeStaleReferences = makePurgeStaleReferences({
    deleteStaleReferences,
    removeReferenceAudio,
  })

  const reconcileMedia = makeReconcileMedia({
    audioStore: deps.audioStore,
    listSongAudio,
    listReferenceAudio,
    markSongFailed,
  })

  const createSong = makeCreateSong({
    insertSong,
    findReferenceById,
    attachReferenceToSong,
    findSongById,
    deleteSong: deleteSongRow,
    now,
    generateId: () => ulid(),
    randomSeed: () => Math.floor(Math.random() * 2 ** 31),
  })
  const createReference = makeCreateReference({
    putReferenceAudio: async (referenceId, audio, contentType) =>
      (await deps.audioStore.put(referenceAudioKey(referenceId, contentType), audio)).byteLength,
    insertReference,
    removeReferenceAudio,
    now,
    generateId: () => ulid(),
  })
  const listSongs = makeListSongs({ listSongs: listSongsPort })
  const getSong = makeGetSong({ findSongById })
  const deleteSong = makeDeleteSong({ deleteSong: deleteSongRow, removeSongAudio })

  const getSongAudio = async (
    songId: string,
  ): Promise<Result<SongAudioPayload, SongAudioLookupError>> => {
    const song = await findSongById(songId)
    if (song === null) return err({ kind: "not_found" })
    if (song.status !== "complete") return err({ kind: "not_complete" })
    const row = await findSongAudio(songId)
    if (row === null) return err({ kind: "not_found" })
    const key = songAudioKey(songId)
    const stored = await deps.audioStore.stat(key)
    if (stored === null) return err({ kind: "not_found" })
    return ok({
      contentType: row.contentType,
      byteLength: stored.byteLength,
      read: async (range) => {
        const bytes =
          range === null
            ? await deps.audioStore.read(key)
            : await deps.audioStore.openRange(key, range.start, range.end)
        if (bytes === null) throw new Error(`song audio is missing at ${key}`)
        return bytes
      },
    })
  }

  const queueDepth = async (): Promise<number> => {
    const page = await listSongsPort({ limit: 1, cursor: null, statuses: ["queued"] })
    return page.count
  }

  const worker = makeSongWorker({
    claimNextQueuedSong,
    markSongRunning,
    markSongStage,
    markSongProgress,
    markSongComplete,
    markSongFailed,
    saveSongAudio,
    findReferenceBySongId,
    runTranscribe,
    saveReferenceScore,
    runYue2Generate,
    encodeFlacToMp3,
    createTempDir: () => mkdtemp(join(tmpdir(), "yuekbox-")),
    removeTempDir: (path) => rm(path, { recursive: true, force: true }),
    logError,
  })

  return {
    createSong,
    createReference,
    purgeStaleReferences,
    listSongs,
    getSong,
    deleteSong,
    getSongAudio,
    recoverInterruptedSongs,
    reconcileMedia,
    queueDepth,
    worker,
  }
}
