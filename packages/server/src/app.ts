import Fastify, { FastifyInstance } from "fastify"
import { PROBLEM_TYPES } from "contracts/http/error"
import { Status, StatusSchema, statusPath } from "contracts/http/status"
import { AiSlice } from "./ai/ai.models"
import { aiRoutes } from "./ai/ai.routes"
import { referencesRoutes } from "./songs/references.routes"
import { SongsSlice } from "./songs/songs.assembly"
import { songsRoutes } from "./songs/songs.routes"

export type AppDeps = Readonly<{
  songs: SongsSlice
  referenceMaxBytes: number
  ai: AiSlice
  status: () => Promise<Status>
}>

const referenceContentTypes = /^(audio\/|application\/octet-stream)/

export const buildApp = (deps: AppDeps): FastifyInstance => {
  const app = Fastify({ logger: false })

  app.addContentTypeParser(
    referenceContentTypes,
    { parseAs: "buffer", bodyLimit: deps.referenceMaxBytes },
    (_request, body, done) => {
      done(null, body)
    },
  )

  app.setErrorHandler((error, _request, reply) => {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500

    if (statusCode >= 500) {
      console.error("unhandled request error", error)
      return reply.status(500).type("application/problem+json").send({
        type: PROBLEM_TYPES.internalError,
        title: "Internal Server Error",
        status: 500,
        detail: "The server failed to handle the request",
      })
    }

    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "bad_request"
    const message = error instanceof Error ? error.message : "Request failed"

    return reply
      .status(statusCode)
      .type("application/problem+json")
      .send({
        type: PROBLEM_TYPES.validationError,
        title: "Validation Error",
        status: statusCode,
        detail: message,
        errors: [{ pointer: "/", code }],
      })
  })

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .type("application/problem+json")
      .send({
        type: PROBLEM_TYPES.notFound,
        title: "Not Found",
        status: 404,
        detail: `route not found: ${request.method} ${request.url}`,
      }),
  )

  app.register(songsRoutes, { songs: deps.songs })
  app.register(referencesRoutes, { songs: deps.songs })
  app.register(aiRoutes, { ai: deps.ai })

  app.get(statusPath, async (_request, reply) => {
    const status = await deps.status()
    return reply.send(StatusSchema.parse(status))
  })

  return app
}
