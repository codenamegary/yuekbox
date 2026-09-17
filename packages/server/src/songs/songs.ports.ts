import { SongStage, SongStatus } from "contracts/http/songs"
import { Result } from "../shared/result"
import {
  EncodeSongError,
  GenerateSongError,
  NewSong,
  Song,
  SongsPage,
  StageProgressUpdate,
  TruncatedFlags,
} from "./songs.models"
import { ListCursor } from "./songs.cursor"

export type InsertSong = (song: NewSong) => Promise<Song>

export type FindSongById = (songId: string) => Promise<Song | null>

export type ListSongsQuery = Readonly<{
  limit: number
  cursor: ListCursor | null
  statuses: readonly SongStatus[]
}>

export type ListSongs = (query: ListSongsQuery) => Promise<SongsPage>

export type SaveSongAudio = (
  input: Readonly<{ songId: string; mp3: Uint8Array; contentType: string }>,
) => Promise<void>

export type FindSongAudio = (
  songId: string,
) => Promise<Readonly<{ mp3: Uint8Array; contentType: string }> | null>

export type MarkSongRunning = (songId: string) => Promise<void>

export type MarkSongStage = (songId: string, stage: SongStage) => Promise<void>

export type MarkSongProgress = (songId: string, progress: StageProgressUpdate) => Promise<void>

export type MarkSongComplete = (
  input: Readonly<{
    songId: string
    scoreAbc: string | null
    durationSeconds: number
    truncated: TruncatedFlags
  }>,
) => Promise<void>

export type MarkSongFailed = (songId: string, errorDetail: string) => Promise<void>

export type ClaimNextQueuedSong = () => Promise<Song | null>

export type DeleteSong = (songId: string) => Promise<boolean>

export type RecoverInterruptedSongs = () => Promise<number>

export type EncodeFlacToMp3 = (flacPath: string) => Promise<Result<Uint8Array, EncodeSongError>>

export type RunYue2GenerateInput = Readonly<{
  songId: string
  lyrics: string
  style: string
  seed: number
  outputDir: string
  onStage: (stage: SongStage) => void
  onProgress: (progress: StageProgressUpdate) => void
}>

export type RunYue2GenerateOutput = Readonly<{
  flacPath: string
  scoreAbc: string | null
  durationSeconds: number
  truncated: TruncatedFlags
  stages: readonly SongStage[]
}>

export type RunYue2Generate = (
  input: RunYue2GenerateInput,
) => Promise<Result<RunYue2GenerateOutput, GenerateSongError>>

export type CreateTempDir = () => Promise<string>

export type RemoveTempDir = (path: string) => Promise<void>
