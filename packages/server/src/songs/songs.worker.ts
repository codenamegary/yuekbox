import { songTitleFromLyrics } from "../media/audio.keys"
import { Song, SongCot, StageProgressUpdate } from "./songs.models"
import {
  ClaimNextQueuedSong,
  CreateTempDir,
  EncodeFlacToMp3,
  FindReferenceAudioBySongId,
  MarkSongComplete,
  MarkSongFailed,
  MarkSongProgress,
  MarkSongRunning,
  MarkSongStage,
  RemoveTempDir,
  RenameReferenceAudio,
  RunTranscribe,
  RunYue2Generate,
  SaveReferenceScore,
  SaveSongAudio,
} from "./songs.ports"

export type SongWorkerDeps = Readonly<{
  claimNextQueuedSong: ClaimNextQueuedSong
  markSongRunning: MarkSongRunning
  markSongStage: MarkSongStage
  markSongProgress: MarkSongProgress
  markSongComplete: MarkSongComplete
  markSongFailed: MarkSongFailed
  saveSongAudio: SaveSongAudio
  renameReferenceAudio: RenameReferenceAudio
  findReferenceAudioBySongId: FindReferenceAudioBySongId
  runTranscribe: RunTranscribe
  saveReferenceScore: SaveReferenceScore
  runYue2Generate: RunYue2Generate
  encodeFlacToMp3: EncodeFlacToMp3
  createTempDir: CreateTempDir
  removeTempDir: RemoveTempDir
  logError: (message: string, error: unknown) => void
}>

export type SongWorker = Readonly<{
  kick: () => void
  drain: () => Promise<void>
  isBusy: () => boolean
}>

const errorDetailLimit = 2000

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
      const title = songTitleFromLyrics(song.lyrics)
      const referenceAudio = await deps.findReferenceAudioBySongId(song.id)
      let cot: SongCot = "full"
      let abc: string | null = null

      if (referenceAudio !== null) {
        await deps.markSongStage(song.id, "transcribe")
        const transcribed = await deps.runTranscribe({
          audioPath: referenceAudio.audioPath,
          outputDir: tempDir,
        })
        if (!transcribed.ok) {
          await deps.markSongFailed(song.id, toErrorDetail(transcribed.error.detail))
          return
        }
        await deps.saveReferenceScore(referenceAudio.reference.id, transcribed.value.scoreAbc)
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

      await deps.saveSongAudio({
        songId: song.id,
        mp3: encoded.value,
        contentType: "audio/mpeg",
        title,
      })
      await deps.markSongComplete({
        songId: song.id,
        scoreAbc: generated.value.scoreAbc,
        durationSeconds: generated.value.durationSeconds,
        truncated: generated.value.truncated,
      })
      if (referenceAudio !== null) {
        await deps
          .renameReferenceAudio({
            referenceId: referenceAudio.reference.id,
            contentType: referenceAudio.reference.contentType,
            title,
          })
          .catch((error) => deps.logError("reference rename failed", error))
      }
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
    kick: () => {
      state.chain = state.chain
        .then(runLoop)
        .catch((error) => deps.logError("worker loop failed", error))
    },
    drain: () => state.chain,
    isBusy: () => state.busy,
  }
}
