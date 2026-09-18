import { CreateSongBody, CreateSongBodySchema } from "contracts/http/songs"
import { err, ok, Result } from "../shared/result"
import { CreateSongError, referenceUnavailableCode, Song } from "./songs.models"
import {
  AttachReferenceToSong,
  DeleteSong,
  FindReferenceById,
  FindSongById,
  InsertSong,
} from "./songs.ports"

export type CreateSongDeps = Readonly<{
  insertSong: InsertSong
  findReferenceById: FindReferenceById
  attachReferenceToSong: AttachReferenceToSong
  findSongById: FindSongById
  deleteSong: DeleteSong
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

    const referenceId = parsed.data.referenceId ?? null
    if (referenceId !== null) {
      const reference = await deps.findReferenceById(referenceId)
      if (reference === null || reference.songId !== null) {
        return err({
          kind: "validation_error",
          pointer: "/referenceId",
          code: referenceUnavailableCode,
        })
      }
    }

    const now = deps.now()
    const song = await deps.insertSong({
      id: deps.generateId(),
      lyrics: parsed.data.lyrics,
      style: parsed.data.style,
      seed: parsed.data.seed ?? deps.randomSeed(),
      cot: referenceId === null ? "full" : "melody",
      referenceId,
      createdAt: now,
      updatedAt: now,
    })

    if (referenceId === null) {
      return ok(song)
    }

    const attached = await deps.attachReferenceToSong(referenceId, song.id)
    if (!attached) {
      await deps.deleteSong(song.id)
      return err({
        kind: "validation_error",
        pointer: "/referenceId",
        code: referenceUnavailableCode,
      })
    }

    const created = await deps.findSongById(song.id)
    return ok(created ?? song)
  }
