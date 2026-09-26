import { Calibration } from "contracts/http/songs"
import { SongAnalysis } from "contracts/http/visualizations"
import { err, ok, Result } from "../shared/result"
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
  SaveTranscriptRaw,
} from "../songs/songs.ports"
import {
  CreateTempDir,
  EncodeFlacToMp3,
  RemoveTempDir,
  RunLyricAlign,
  RunTranscribe,
  RunVocalTranscript,
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
  saveTranscriptRaw: SaveTranscriptRaw
  completeSong: CompleteSong
  runTranscribe: RunTranscribe
  runLyricAlign: RunLyricAlign
  runVocalTranscript: RunVocalTranscript
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

/**
 * The cot level and score abc generation receives, given whether reference
 * audio exists. The transcribe stage runs here, and a failure has already
 * marked the song failed by the time the error comes back.
 */
const referenceInputs = async (
  deps: SongWorkerDeps,
  song: Song,
  reference: Awaited<ReturnType<FindReferenceBySongId>>,
  tempDir: string,
): Promise<Result<Readonly<{ cot: SongCot; abc: string | null }>, string>> => {
  if (reference === null) return ok({ cot: "full", abc: null })
  if (reference.audioPath === null) {
    await deps.markSongFailed(song.id, missingReferenceDetail)
    return err(missingReferenceDetail)
  }
  await deps.markSongStage(song.id, "transcribe")
  const transcribed = await deps.runTranscribe({
    audioPath: reference.audioPath,
    outputDir: tempDir,
  })
  if (!transcribed.ok) {
    await deps.markSongFailed(song.id, toErrorDetail(transcribed.error.detail))
    return err(transcribed.error.detail)
  }
  await deps.saveReferenceScore(song.id, transcribed.value.scoreAbc)
  return ok({ cot: "melody", abc: transcribed.value.scoreAbc })
}

/** The alignment result when it can be produced; a failure is logged, not fatal. */
const alignCalibration = async (
  deps: SongWorkerDeps,
  flacPath: string,
  tempDir: string,
): Promise<Calibration | null> => {
  try {
    const aligned = await deps.runLyricAlign({ audioPath: flacPath, outputDir: tempDir })
    if (aligned.ok) return aligned.value.calibration
    deps.logError("lyric alignment failed", aligned.error.detail)
    return null
  } catch (error) {
    deps.logError("lyric alignment failed", error)
    return null
  }
}

/** The measured analysis when the vocal transcript succeeds; logged, not fatal. */
const transcriptAnalysis = async (
  deps: SongWorkerDeps,
  songId: string,
  flacPath: string,
  durationSeconds: number,
  tempDir: string,
): Promise<SongAnalysis | null> => {
  try {
    const transcript = await deps.runVocalTranscript({
      audioPath: flacPath,
      outputDir: tempDir,
      durationSeconds,
    })
    if (!transcript.ok) {
      deps.logError("vocal transcription failed", transcript.error.detail)
      return null
    }
    try {
      await deps.saveTranscriptRaw(songId, transcript.value.transcriptDir)
    } catch (error) {
      deps.logError("saving the raw transcript failed", error)
    }
    return {
      version: 1,
      source: "sheetsage2",
      notes: transcript.value.notes,
      beats: transcript.value.beats,
      sections: transcript.value.sections,
    }
  } catch (error) {
    deps.logError("vocal transcription failed", error)
    return null
  }
}

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
      const inputs = await referenceInputs(deps, song, reference, tempDir)
      if (!inputs.ok) return
      const { cot, abc } = inputs.value

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

      await deps.markSongStage(song.id, "sync")
      const calibration = await alignCalibration(deps, generated.value.flacPath, tempDir)
      const analysis = await transcriptAnalysis(
        deps,
        song.id,
        generated.value.flacPath,
        generated.value.durationSeconds,
        tempDir,
      )

      await deps.completeSong({
        songId: song.id,
        mp3: encoded.value,
        scoreAbc: generated.value.scoreAbc,
        calibration,
        analysis,
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
