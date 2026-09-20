import { SongStage, SongStatus } from "contracts/http/songs"
import { Result } from "../shared/result"
import {
  EncodeSongError,
  GenerateSongError,
  NewReference,
  NewSong,
  Reference,
  Song,
  SongCot,
  SongsPage,
  StageProgressUpdate,
  TranscribeError,
  TruncatedFlags,
} from "./songs.models"
import { ListCursor } from "./songs.cursor"

export type InsertSong = (song: NewSong) => Promise<Song>

export type FindSongById = (songId: string) => Promise<Song | null>

export type InsertReference = (reference: NewReference) => Promise<Reference>

export type FindReferenceById = (referenceId: string) => Promise<Reference | null>

export type FindReferenceBySongId = (songId: string) => Promise<Reference | null>

export type TranscribeReference = Readonly<{
  reference: Reference
  audioPath: string
}>

export type FindReferenceAudioBySongId = (songId: string) => Promise<TranscribeReference | null>

export type AttachReferenceToSong = (referenceId: string, songId: string) => Promise<boolean>

export type SaveReferenceScore = (referenceId: string, scoreAbc: string) => Promise<void>

export type DeleteStaleReferences = (createdBefore: string) => Promise<readonly DeletedReference[]>

export type DeletedReference = Readonly<{
  id: string
  contentType: string
}>

export type ListSongsQuery = Readonly<{
  limit: number
  cursor: ListCursor | null
  statuses: readonly SongStatus[]
}>

export type ListSongs = (query: ListSongsQuery) => Promise<SongsPage>

export type SaveSongAudio = (
  input: Readonly<{ songId: string; mp3: Uint8Array; contentType: string; title: string }>,
) => Promise<void>

export type RenameReferenceAudio = (
  input: Readonly<{ referenceId: string; contentType: string; title: string }>,
) => Promise<void>

export type InsertSongAudio = (
  row: Readonly<{ songId: string; byteLength: number; contentType: string }>,
) => Promise<void>

export type FindSongAudio = (
  songId: string,
) => Promise<Readonly<{ byteLength: number; contentType: string }> | null>

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
  cot: SongCot
  abc: string | null
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

export type RunTranscribeInput = Readonly<{
  audioPath: string
  outputDir: string
}>

export type RunTranscribeOutput = Readonly<{
  scoreAbc: string
}>

export type RunTranscribe = (
  input: RunTranscribeInput,
) => Promise<Result<RunTranscribeOutput, TranscribeError>>

export type CreateTempDir = () => Promise<string>

export type RemoveTempDir = (path: string) => Promise<void>

export type StoredAudio = Readonly<{
  path: string
  byteLength: number
}>

export type SongAudioRecord = Readonly<{
  songId: string
  songStatus: SongStatus
}>

export type ReferenceAudioRecord = Readonly<{
  id: string
  contentType: string
}>

export type ListSongAudio = () => Promise<readonly SongAudioRecord[]>

export type ListReferenceAudio = () => Promise<readonly ReferenceAudioRecord[]>

export type AudioStore = Readonly<{
  path: (key: string) => string
  put: (key: string, audio: Uint8Array) => Promise<StoredAudio>
  stat: (key: string) => Promise<StoredAudio | null>
  read: (key: string) => Promise<Uint8Array | null>
  openRange: (key: string, start: number, end: number) => Promise<Uint8Array | null>
  move: (fromKey: string, toKey: string) => Promise<void>
  remove: (key: string) => Promise<void>
  list: () => Promise<readonly string[]>
}>
