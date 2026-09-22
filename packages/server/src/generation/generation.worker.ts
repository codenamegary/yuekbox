import { Calibration } from "contracts/http/songs"
import { Song, SongCot, StageProgressUpdate } from "../songs/songs.models"
import {
  ClaimNextQueuedSong,
  CompleteSong,
  FindReferenceBySongId,
  MarkSongFailed,
  MarkSongProgress,
  MarkSongRunning,
  MarkSongStage,
  SaveReferenceScore,
} from "../songs/songs.ports"
import {
  CreateTempDir,
  EncodeFlacToMp3,
  RemoveTempDir,
  RunLyricAlign,
  RunTranscribe,
  RunYue2Generate,
} from "./generation.ports"

export type SongWorkerDeps = Readonly<{
  claimNextQueuedSong: ClaimNextQueuedSong
  markSongRunning: MarkSongRunning
  markSongStage: MarkSongStage
  markSongProgress: MarkSongProgress
  markSongFailed: MarkSongFailed
  findReferenceBySongId: FindReferenceBySongId
  saveReferenceScore: SaveReferenceScore
  completeSong: CompleteSong
  runTranscribe: RunTranscribe
  runLyricAlign: RunLyricAlign
  runYue2Generate: RunYue2Generate
  encodeFlacToMp3: EncodeFlacToMp3
  createTempDir: CreateTempDir
  removeTempDir: RemoveTempDir
  logError: (message: string, error: unknown) => void
}>

export type SongWorker = Readonly<{
  wake: () => void
  drain: () => Promise<void>
  isBusy: () => boolean
}>

const errorDetailLimit = 2000

const missingReferenceDetail = "reference audio is missing"

const toErrorDetail = (value: string): string =>
  value.trim().slice(0, errorDetailLimit) || "unknown error"

export const makeSongWorker = (deps: SongWorkerDeps): SongWorker => {
  const state = { chain: Promise.resolve(), busy: false }

  const processSong = async (song: Song): Promise<void> => {
    await deps.markSongRunning(song.id)
    const tempDir = await deps.createTempDir()

    const stageQueue = { tail: Promise.resolve() }
    const noteStage = (stage: Parameters<MarkSongStage>[1]) => {
      stageQueue.tail = stageQueue.tail
        .then(() => deps.markSongStage(song.id, stage))
        .catch((error) => deps.logError("stage update failed", error))
    }
    const noteProgress = (progress: StageProgressUpdate) => {
      stageQueue.tail = stageQueue.tail
        .then(() => deps.markSongProgress(song.id, progress))
        .catch((error) => deps.logError("progress update failed", error))
    }

    try {
      const reference = await deps.findReferenceBySongId(song.id)
      let cot: SongCot = "full"
      let abc: string | null = null

      if (reference !== null) {
        if (reference.audioPath === null) {
          await deps.markSongFailed(song.id, missingReferenceDetail)
          return
        }
        await deps.markSongStage(song.id, "transcribe")
        const transcribed = await deps.runTranscribe({
          audioPath: reference.audioPath,
          outputDir: tempDir,
        })
        if (!transcribed.ok) {
          await deps.markSongFailed(song.id, toErrorDetail(transcribed.error.detail))
          return
        }
        await deps.saveReferenceScore(song.id, transcribed.value.scoreAbc)
        cot = "melody"
        abc = transcribed.value.scoreAbc
      }

      const generated = await deps.runYue2Generate({
        songId: song.id,
        lyrics: song.lyrics,
        style: song.style,
        seed: song.seed,
        cot,
        abc,
        outputDir: tempDir,
        onStage: noteStage,
        onProgress: noteProgress,
      })
      await stageQueue.tail

      if (!generated.ok) {
        await deps.markSongFailed(song.id, toErrorDetail(generated.error.detail))
        return
      }

      await deps.markSongStage(song.id, "encode")
      const encoded = await deps.encodeFlacToMp3(generated.value.flacPath)
      if (!encoded.ok) {
        await deps.markSongFailed(song.id, toErrorDetail(encoded.error.detail))
        return
      }

      let calibration: Calibration | null = null
      await deps.markSongStage(song.id, "sync")
      try {
        const aligned = await deps.runLyricAlign({
          audioPath: generated.value.flacPath,
          outputDir: tempDir,
        })
        if (aligned.ok) {
          calibration = aligned.value.calibration
        } else {
          deps.logError("lyric alignment failed", aligned.error.detail)
        }
      } catch (error) {
        deps.logError("lyric alignment failed", error)
      }

      await deps.completeSong({
        songId: song.id,
        mp3: encoded.value,
        scoreAbc: generated.value.scoreAbc,
        calibration,
        durationSeconds: generated.value.durationSeconds,
        truncated: generated.value.truncated,
      })
    } finally {
      await deps
        .removeTempDir(tempDir)
        .catch((error) => deps.logError("temp directory cleanup failed", error))
    }
  }

  const processNext = async (): Promise<boolean> => {
    const song = await deps.claimNextQueuedSong()
    if (song === null) return false

    try {
      await processSong(song)
    } catch (error) {
      deps.logError("song processing failed", error)
      const detail = error instanceof Error ? error.message : String(error)
      await deps
        .markSongFailed(song.id, toErrorDetail(detail))
        .catch((markError) => deps.logError("marking the song failed itself failed", markError))
    }

    return true
  }

  const runLoop = async (): Promise<void> => {
    state.busy = true
    try {
      while (await processNext()) {
        // claim until the queue drains
      }
    } finally {
      state.busy = false
    }
  }

  return {
    wake: () => {
      state.chain = state.chain
        .then(runLoop)
        .catch((error) => deps.logError("worker loop failed", error))
    },
    drain: () => state.chain,
    isBusy: () => state.busy,
  }
}
