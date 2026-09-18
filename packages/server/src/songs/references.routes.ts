import { FastifyPluginAsync } from "fastify"
import {
  ReferenceSchema,
  ReferenceUploadQuerySchema,
  referencePath,
  referencesPath,
} from "contracts/http/references"
import { issuePointer, sendProblem, validationProblem } from "../shared/problems"
import { Reference } from "./songs.models"
import { SongsSlice } from "./songs.assembly"

export type ReferencesRoutesOptions = Readonly<{
  songs: SongsSlice
}>

const toReferenceResponse = (reference: Reference) =>
  ReferenceSchema.parse({
    id: reference.id,
    filename: reference.filename,
    contentType: reference.contentType,
    byteLength: reference.byteLength,
    createdAt: reference.createdAt,
  })

const isReferenceContentType = (contentType: string): boolean =>
  contentType.startsWith("audio/") || contentType === "application/octet-stream"

export const referencesRoutes: FastifyPluginAsync<ReferencesRoutesOptions> = async (
  fastify,
  options,
) => {
  fastify.post(referencesPath, async (request, reply) => {
    const contentType = request.headers["content-type"]
    if (typeof contentType !== "string" || !isReferenceContentType(contentType)) {
      return sendProblem(
        reply,
        validationProblem(
          [{ pointer: "/content-type", code: "invalid" }],
          "Content type must be audio",
          415,
        ),
      )
    }

    const query = ReferenceUploadQuerySchema.safeParse(request.query)
    if (!query.success) {
      return sendProblem(
        reply,
        validationProblem(
          query.error.issues.map((issue) => ({
            pointer: issuePointer(issue.path),
            code: issue.code,
          })),
          "Query parameters failed validation",
        ),
      )
    }

    const body = request.body
    if (!(body instanceof Buffer) || body.byteLength === 0) {
      return sendProblem(
        reply,
        validationProblem(
          [{ pointer: "/body", code: "too_small" }],
          "Audio body must not be empty",
        ),
      )
    }

    const result = await options.songs.createReference({
      filename: query.data.filename,
      contentType,
      audio: new Uint8Array(body),
    })
    if (!result.ok) {
      return sendProblem(
        reply,
        validationProblem(
          [{ pointer: result.error.pointer, code: result.error.code }],
          "Reference upload failed validation",
        ),
      )
    }

    reply.header("location", referencePath(result.value.id))
    return reply.status(201).send(toReferenceResponse(result.value))
  })
}
