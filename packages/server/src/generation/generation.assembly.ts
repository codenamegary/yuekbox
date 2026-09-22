import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SongsCapabilities } from "../songs/songs.assembly"
import { EncodeFlacToMp3, RunLyricAlign, RunTranscribe, RunYue2Generate } from "./generation.ports"
import { makeSongWorker, SongWorker } from "./generation.worker"

export type GenerationSliceDeps = Readonly<{
  songs: SongsCapabilities
  runYue2Generate: RunYue2Generate
  runTranscribe: RunTranscribe
  runLyricAlign: RunLyricAlign
  encodeFlacToMp3: EncodeFlacToMp3
  logError?: (message: string, error: unknown) => void
}>

export type GenerationSlice = Readonly<{
  worker: SongWorker
}>

export const assembleGenerationSlice = (deps: GenerationSliceDeps): GenerationSlice => {
  const logError = deps.logError ?? ((message, error) => console.error(message, error))
  const worker = makeSongWorker({
    ...deps.songs,
    runYue2Generate: deps.runYue2Generate,
    runTranscribe: deps.runTranscribe,
    runLyricAlign: deps.runLyricAlign,
    encodeFlacToMp3: deps.encodeFlacToMp3,
    createTempDir: () => mkdtemp(join(tmpdir(), "yuekbox-")),
    removeTempDir: (path) => rm(path, { recursive: true, force: true }),
    logError,
  })

  return { worker }
}
