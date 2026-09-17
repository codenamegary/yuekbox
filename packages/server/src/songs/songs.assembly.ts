import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CreateSongBody } from "contracts/http/songs"
import { ulid } from "ulid"
import { Db } from "../db/client"
import { err, ok, Result } from "../shared/result"
import { makeCreateSong } from "./songs.create.usecase"
import { makeDeleteSong } from "./songs.delete.usecase"
import { makeGetSong } from "./songs.get.usecase"
import { makeListSongs, ListSongsInput } from "./songs.list.usecase"
import {
  CreateSongError,
  DeleteSongError,
  GetSongError,
  ListSongsError,
  Song,
  SongAudioLookupError,
  SongsPage,
} from "./songs.models"
import {
  makeClaimNextQueuedSong,
  makeDeleteSong as makeDeleteSongAdapter,
  makeFindSongAudio,
  makeFindSongById,
  makeInsertSong,
  makeListSongs as makeListSongsAdapter,
  makeMarkSongComplete,
  makeMarkSongFailed,
  makeMarkSongProgress,
  makeMarkSongRunning,
  makeMarkSongStage,
  makeRecoverInterruptedSongs,
  makeSaveSongAudio,
} from "./songs.sqlite.adapters"
import { makeEncodeFlacToMp3, FfmpegAdapterEnv } from "./songs.ffmpeg.adapters"
import { makeRunYue2Generate, Yue2AdapterEnv } from "./songs.yue2.adapters"
import { makeSongWorker, SongWorker } from "./songs.worker"

export type SongAudioPayload = Readonly<{ mp3: Uint8Array; contentType: string }>

export type SongsSliceDeps = Readonly<{
  db: Db
  yue2: Yue2AdapterEnv
  ffmpeg: FfmpegAdapterEnv
  now?: () => string
  logError?: (message: string, error: unknown) => void
}>

export type SongsSlice = Readonly<{
  createSong: (body: CreateSongBody) => Promise<Result<Song, CreateSongError>>
  listSongs: (input: ListSongsInput) => Promise<Result<SongsPage, ListSongsError>>
  getSong: (songId: string) => Promise<Result<Song, GetSongError>>
  deleteSong: (songId: string) => Promise<Result<null, DeleteSongError>>
  getSongAudio: (songId: string) => Promise<Result<SongAudioPayload, SongAudioLookupError>>
  recoverInterruptedSongs: () => Promise<number>
  queueDepth: () => Promise<number>
  worker: SongWorker
}>

export const assembleSongsSlice = (deps: SongsSliceDeps): SongsSlice => {
  const now = deps.now ?? (() => new Date().toISOString())
  const logError = deps.logError ?? ((message, error) => console.error(message, error))

  const insertSong = makeInsertSong(deps.db)
  const findSongById = makeFindSongById(deps.db)
  const findSongAudio = makeFindSongAudio(deps.db)
  const listSongsPort = makeListSongsAdapter(deps.db)
  const saveSongAudio = makeSaveSongAudio(deps.db)
  const markSongRunning = makeMarkSongRunning(deps.db)
  const markSongStage = makeMarkSongStage(deps.db)
  const markSongProgress = makeMarkSongProgress(deps.db)
  const markSongComplete = makeMarkSongComplete(deps.db)
  const markSongFailed = makeMarkSongFailed(deps.db)
  const claimNextQueuedSong = makeClaimNextQueuedSong(deps.db)
  const deleteSongRow = makeDeleteSongAdapter(deps.db)
  const recoverInterruptedSongs = makeRecoverInterruptedSongs(deps.db)

  const runYue2Generate = makeRunYue2Generate(deps.yue2)
  const encodeFlacToMp3 = makeEncodeFlacToMp3(deps.ffmpeg)

  const createSong = makeCreateSong({
    insertSong,
    now,
    generateId: () => ulid(),
    randomSeed: () => Math.floor(Math.random() * 2 ** 31),
  })
  const listSongs = makeListSongs({ listSongs: listSongsPort })
  const getSong = makeGetSong({ findSongById })
  const deleteSong = makeDeleteSong({ deleteSong: deleteSongRow })

  const getSongAudio = async (
    songId: string,
  ): Promise<Result<SongAudioPayload, SongAudioLookupError>> => {
    const song = await findSongById(songId)
    if (song === null) return err({ kind: "not_found" })
    if (song.status !== "complete") return err({ kind: "not_complete" })
    const audio = await findSongAudio(songId)
    if (audio === null) return err({ kind: "not_found" })
    return ok(audio)
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
    runYue2Generate,
    encodeFlacToMp3,
    createTempDir: () => mkdtemp(join(tmpdir(), "yuekbox-")),
    removeTempDir: (path) => rm(path, { recursive: true, force: true }),
    logError,
  })

  return {
    createSong,
    listSongs,
    getSong,
    deleteSong,
    getSongAudio,
    recoverInterruptedSongs,
    queueDepth,
    worker,
  }
}
