import { CreateSongBody, CreateSongBodySchema } from "contracts/http/songs"
import { err, ok, Result } from "../shared/result"
import { CreateSongError, Song } from "./songs.models"
import { InsertSong } from "./songs.ports"

export type CreateSongDeps = Readonly<{
  insertSong: InsertSong
  now: () => string
  generateId: () => string
  randomSeed: () => number
}>

export const makeCreateSong =
  (deps: CreateSongDeps) =>
  async (body: CreateSongBody): Promise<Result<Song, CreateSongError>> => {
    const parsed = CreateSongBodySchema.safeParse(body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const pointer =
        issue !== undefined && issue.path.length > 0 ? `/${issue.path.join("/")}` : "/"
      return err({ kind: "validation_error", pointer, code: issue?.code ?? "invalid" })
    }

    const now = deps.now()
    const song = await deps.insertSong({
      id: deps.generateId(),
      lyrics: parsed.data.lyrics,
      style: parsed.data.style,
      seed: parsed.data.seed ?? deps.randomSeed(),
      cot: "full",
      createdAt: now,
      updatedAt: now,
    })

    return ok(song)
  }
