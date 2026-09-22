import { CreateSongBody, SongStage, SongStatus } from "contracts/http/songs"
import { SongAnalysis } from "contracts/http/visualizations"
import { Result } from "../shared/result"
import { ListCursor } from "./songs.cursor"
import {
  CompleteSongInput,
  CreateSongError,
  NewSong,
  Song,
  SongsPage,
  StageProgressUpdate,
  TranscribeReference,
} from "./songs.models"

export type CreateSong = (body: CreateSongBody) => Promise<Result<Song, CreateSongError>>

export type InsertSong = (song: NewSong) => Promise<Song>

export type FindSongById = (songId: string) => Promise<Song | null>

export type ListSongsQuery = Readonly<{
  limit: number
  cursor: ListCursor | null
  statuses: readonly SongStatus[]
}>

export type ListSongs = (query: ListSongsQuery) => Promise<SongsPage>

export type ClaimNextQueuedSong = () => Promise<Song | null>

export type MarkSongRunning = (songId: string) => Promise<void>

export type MarkSongStage = (songId: string, stage: SongStage) => Promise<void>

export type MarkSongProgress = (songId: string, progress: StageProgressUpdate) => Promise<void>

export type MarkSongComplete = (
  input: Readonly<{
    songId: string
    durationSeconds: number
    truncated: Readonly<{ abc: boolean; semantic: boolean }>
  }>,
) => Promise<void>

export type MarkSongFailed = (songId: string, errorDetail: string) => Promise<void>

export type DeleteSong = (songId: string) => Promise<boolean>

export type RecoverInterruptedSongs = () => Promise<number>

export type FindReferenceBySongId = (songId: string) => Promise<TranscribeReference | null>

export type SaveReferenceScore = (songId: string, scoreAbc: string) => Promise<void>

export type CompleteSong = (input: CompleteSongInput) => Promise<void>

/** Keeps a transcript tool's raw output tree beside the Song. */
export type SaveTranscriptRaw = (songId: string, sourceDir: string) => Promise<void>

export type ReadAnalysis = (songId: string) => Promise<SongAnalysis | null>
