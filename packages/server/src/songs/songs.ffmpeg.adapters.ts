import { err, ok, Result } from "../shared/result"
import { EncodeSongError } from "./songs.models"
import { EncodeFlacToMp3 } from "./songs.ports"

export type FfmpegAdapterEnv = Readonly<{
  ffmpegBin: string
}>

export const makeEncodeFlacToMp3 =
  (env: FfmpegAdapterEnv): EncodeFlacToMp3 =>
  async (flacPath): Promise<Result<Uint8Array, EncodeSongError>> => {
    const mp3Path = `${flacPath}.mp3`
    const proc = Bun.spawn(
      [
        env.ffmpegBin,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        flacPath,
        "-codec:a",
        "libmp3lame",
        "-qscale:a",
        "2",
        mp3Path,
      ],
      { stdout: "ignore", stderr: "pipe" },
    )

    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited])

    if (exitCode !== 0) {
      const detail = stderr.trim().slice(-1000) || `ffmpeg exited with code ${exitCode}`
      return err({ kind: "encode_failed", detail })
    }

    const file = Bun.file(mp3Path)
    if (!(await file.exists())) {
      return err({ kind: "encode_failed", detail: "ffmpeg finished without an mp3 file" })
    }

    return ok(new Uint8Array(await file.arrayBuffer()))
  }

export const checkFfmpeg = async (ffmpegBin: string): Promise<"ok" | "missing"> => {
  try {
    const proc = Bun.spawn([ffmpegBin, "-hide_banner", "-encoders"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (exitCode !== 0) return "missing"
    return `${stdout}${stderr}`.includes("libmp3lame") ? "ok" : "missing"
  } catch {
    return "missing"
  }
}
