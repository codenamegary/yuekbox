import { FastifyPluginAsync } from "fastify"
import {
  CreateSongBodySchema,
  SongSchema,
  SongsCollectionSchema,
  SongsQuerySchema,
  songPath,
  songsPath,
} from "contracts/http/songs"
import { UlidSchema } from "contracts/http/primitives"
import {
  conflictProblem,
  issuePointer,
  notFoundProblem,
  sendProblem,
  validationProblem,
} from "../shared/problems"
import { SongsSlice } from "./songs.assembly"
import { Song } from "./songs.models"

export type SongsRoutesOptions = Readonly<{
  songs: SongsSlice
}>

type ByteRange = Readonly<{ start: number; end: number }>

const parseRangeHeader = (
  header: string | undefined,
  total: number,
): ByteRange | "invalid" | null => {
  if (header === undefined) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return "invalid"

  const startText = match[1] ?? ""
  const endText = match[2] ?? ""
  if (startText === "" && endText === "") return "invalid"

  if (startText === "") {
    const suffixLength = Number.parseInt(endText, 10)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return "invalid"
    return { start: Math.max(0, total - suffixLength), end: total - 1 }
  }

  const start = Number.parseInt(startText, 10)
  const end = endText === "" ? total - 1 : Number.parseInt(endText, 10)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
    return "invalid"
  }
  return { start, end: Math.min(end, total - 1) }
}

type SongResponseOptions = Readonly<{
  includeScore?: boolean
}>

export const toSongResponse = (song: Song, options: SongResponseOptions = {}) =>
  SongSchema.parse({
    id: song.id,
    status: song.status,
    ...(song.stage !== null ? { stage: song.stage } : {}),
    ...(song.status === "running" && song.stageCompleted !== null && song.stageTotal !== null
      ? { stageProgress: { completed: song.stageCompleted, total: song.stageTotal } }
      : {}),
    lyrics: song.lyrics,
    style: song.style,
    seed: song.seed,
    ...(song.reference !== null ? { reference: song.reference } : {}),
    ...(song.durationSeconds !== null ? { durationSeconds: song.durationSeconds } : {}),
    ...(song.truncatedAbc !== null && song.truncatedSemantic !== null
      ? { truncated: { abc: song.truncatedAbc, semantic: song.truncatedSemantic } }
      : {}),
    ...(options.includeScore === true && song.scoreAbc !== null ? { scoreAbc: song.scoreAbc } : {}),
    ...(song.errorDetail !== null ? { errorDetail: song.errorDetail } : {}),
    createdAt: song.createdAt,
    updatedAt: song.updatedAt,
    ...(song.completedAt !== null ? { completedAt: song.completedAt } : {}),
  })

export const songsRoutes: FastifyPluginAsync<SongsRoutesOptions> = async (fastify, options) => {
  const { songs } = options

  fastify.post(songsPath, async (request, reply) => {
    const parsed = CreateSongBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(
        reply,
        validationProblem(
          parsed.error.issues.map((issue) => ({
            pointer: issuePointer(issue.path),
            code: issue.code,
          })),
          "Request body failed validation",
        ),
      )
    }

    const result = await songs.createSong(parsed.data)
    if (!result.ok) {
      return sendProblem(
        reply,
        validationProblem(
          [{ pointer: result.error.pointer, code: result.error.code }],
          "Request body failed validation",
        ),
      )
    }

    songs.worker.kick()

    reply.header("location", songPath(result.value.id))
    return reply.status(201).send(toSongResponse(result.value))
  })

  fastify.get(songsPath, async (request, reply) => {
    const parsed = SongsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return sendProblem(
        reply,
        validationProblem(
          parsed.error.issues.map((issue) => ({
            pointer: issuePointer(issue.path),
            code: issue.code,
          })),
          "Query parameters failed validation",
        ),
      )
    }

    const result = await songs.listSongs({
      limit: parsed.data.limit,
      cursor: parsed.data.cursor ?? null,
      statuses: parsed.data.status ?? [],
    })
    if (!result.ok) {
      return sendProblem(
        reply,
        validationProblem([{ pointer: "/cursor", code: result.error.kind }], "Cursor is invalid"),
      )
    }

    const page = result.value
    return reply.send(
      SongsCollectionSchema.parse({
        items: page.items.map((song) => toSongResponse(song)),
        page: {
          limit: page.limit,
          ...(page.nextCursor !== null ? { nextCursor: page.nextCursor } : {}),
          ...(page.previousCursor !== null ? { previousCursor: page.previousCursor } : {}),
          count: page.count,
        },
      }),
    )
  })

  fastify.get<{ Params: { songId: string } }>(`${songsPath}/:songId`, async (request, reply) => {
    const songId = request.params.songId
    if (!UlidSchema.safeParse(songId).success) {
      return sendProblem(reply, notFoundProblem(`Song ${songId} does not exist`))
    }

    const result = await songs.getSong(songId)
    if (!result.ok) {
      return sendProblem(reply, notFoundProblem(`Song ${songId} does not exist`))
    }

    return reply.send(toSongResponse(result.value, { includeScore: true }))
  })

  fastify.get<{ Params: { songId: string } }>(
    `${songsPath}/:songId/audio`,
    async (request, reply) => {
      const songId = request.params.songId
      if (!UlidSchema.safeParse(songId).success) {
        return sendProblem(reply, notFoundProblem(`Song ${songId} does not exist`))
      }

      const result = await songs.getSongAudio(songId)
      if (!result.ok) {
        if (result.error.kind === "not_complete") {
          return sendProblem(reply, conflictProblem(`Song ${songId} has no audio yet`))
        }
        return sendProblem(reply, notFoundProblem(`Song ${songId} does not exist`))
      }

      const total = result.value.mp3.byteLength
      reply.header("content-type", result.value.contentType)
      reply.header("accept-ranges", "bytes")

      const range = parseRangeHeader(request.headers.range, total)
      if (range === "invalid") {
        reply.header("content-range", `bytes */${total}`)
        return reply.status(416).send()
      }
      if (range === null) {
        reply.header("content-length", String(total))
        return reply.send(Buffer.from(result.value.mp3))
      }

      const slice = Buffer.from(result.value.mp3.subarray(range.start, range.end + 1))
      reply.header("content-range", `bytes ${range.start}-${range.end}/${total}`)
      reply.header("content-length", String(slice.byteLength))
      return reply.status(206).send(slice)
    },
  )

  fastify.delete<{ Params: { songId: string } }>(`${songsPath}/:songId`, async (request, reply) => {
    const songId = request.params.songId
    if (!UlidSchema.safeParse(songId).success) {
      return sendProblem(reply, notFoundProblem(`Song ${songId} does not exist`))
    }

    const result = await songs.deleteSong(songId)
    if (!result.ok) {
      return sendProblem(reply, notFoundProblem(`Song ${songId} does not exist`))
    }

    return reply.status(204).send()
  })
}
