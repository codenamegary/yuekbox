import { Result } from "../shared/result"
import {
  EncodeSongError,
  GenerateSongError,
  LyricAlignError,
  RunLyricAlignInput,
  RunLyricAlignOutput,
  RunTranscribeInput,
  RunTranscribeOutput,
  RunYue2GenerateInput,
  RunYue2GenerateOutput,
  TranscribeError,
} from "./generation.models"

export type RunYue2Generate = (
  input: RunYue2GenerateInput,
) => Promise<Result<RunYue2GenerateOutput, GenerateSongError>>

export type RunTranscribe = (
  input: RunTranscribeInput,
) => Promise<Result<RunTranscribeOutput, TranscribeError>>

export type RunLyricAlign = (
  input: RunLyricAlignInput,
) => Promise<Result<RunLyricAlignOutput, LyricAlignError>>

export type EncodeFlacToMp3 = (flacPath: string) => Promise<Result<Uint8Array, EncodeSongError>>

export type CreateTempDir = () => Promise<string>

export type RemoveTempDir = (path: string) => Promise<void>
