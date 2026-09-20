import { CreateSongBody, CreateSongBodySchema } from "contracts/http/songs"
import { FindFiles, MakeDirectory, MoveFile, RemoveDirectory } from "../media/media.ports"
import { err, ok, Result } from "../shared/result"
import {
  parseReferenceFileName,
  referenceFileKey,
  songFolderName,
  songTitleFromLyrics,
  uploadPattern,
} from "./songs.files"
import { CreateSongError, referenceUnavailableCode, Song, SongReference } from "./songs.models"
import { DeleteSong, InsertSong } from "./songs.ports"

export type CreateSongDeps = Readonly<{
  insertSong: InsertSong
  deleteSong: DeleteSong
  makeDirectory: MakeDirectory
  moveFile: MoveFile
  removeDirectory: RemoveDirectory
  find: FindFiles
  now: () => string
  generateId: () => string
  randomSeed: () => number
  /** Fired once the Song and its folder exist; the AI visuals writer listens here. */
  onSongQueued?: (songId: string) => void
}>

type UploadedReference = Readonly<{ key: string; fileName: string }>

const findUploadedReference = async (
  find: FindFiles,
  referenceId: string,
): Promise<UploadedReference | null> => {
  const matches = await find(uploadPattern(referenceId))
  const key = matches[0]
  if (key === undefined) return null
  return Object.freeze({ key, fileName: key.slice(key.lastIndexOf("/") + 1) })
}

const toReferenceSummary = (fileName: string): SongReference | null => {
  const parts = parseReferenceFileName(fileName)
  return parts === null ? null : Object.freeze({ id: parts.id, filename: parts.displayName })
}

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
    let upload: UploadedReference | null = null
    if (referenceId !== null) {
      upload = await findUploadedReference(deps.find, referenceId)
      if (upload === null) {
        return err({
          kind: "validation_error",
          pointer: "/referenceId",
          code: referenceUnavailableCode,
        })
      }
    }

    const now = deps.now()
    const songId = deps.generateId()
    const folderKey = songFolderName(songTitleFromLyrics(parsed.data.lyrics), songId)
    const song = await deps.insertSong({
      id: songId,
      lyrics: parsed.data.lyrics,
      style: parsed.data.style,
      seed: parsed.data.seed ?? deps.randomSeed(),
      cot: referenceId === null ? "full" : "melody",
      createdAt: now,
      updatedAt: now,
    })

    try {
      await deps.makeDirectory(folderKey)
      if (upload !== null) {
        await deps.moveFile(upload.key, referenceFileKey(folderKey, upload.fileName))
      }
    } catch (error: unknown) {
      await deps.deleteSong(songId).catch(() => undefined)
      await deps.removeDirectory(folderKey).catch(() => undefined)
      throw error
    }

    deps.onSongQueued?.(songId)

    return ok(
      Object.freeze({
        ...song,
        reference: upload === null ? null : toReferenceSummary(upload.fileName),
      }),
    )
  }
