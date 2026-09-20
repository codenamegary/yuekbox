import { FastifyPluginAsync, FastifyReply } from "fastify"
import {
  AiConfigPatchSchema,
  aiConfigPath,
  aiEnhancePath,
  aiModelsPath,
  aiPresetsPath,
  aiRandomSongPath,
  AiModelsSchema,
  AiPresetsSchema,
  EnhanceBodySchema,
  EnhanceResultSchema,
  WriterScopeSchema,
} from "contracts/http/ai"
import { PROBLEM_TYPES, ProblemError } from "contracts/http/error"
import { toSongResponse } from "../songs/songs.responses"
import { AiSlice } from "./ai.assembly"

export type AiRoutesOptions = Readonly<{
  ai: AiSlice
}>

type ProblemBody = Readonly<{
  type: string
  title: string
  status: number
  detail: string
  errors?: readonly ProblemError[]
}>

const problem = (
  status: number,
  type: string,
  title: string,
  detail: string,
  errors?: readonly ProblemError[],
): ProblemBody => ({
  type,
  title,
  status,
  detail,
  ...(errors !== undefined ? { errors } : {}),
})

const sendProblem = (reply: FastifyReply, body: ProblemBody) =>
  reply.status(body.status).type("application/problem+json").send(body)

const issuePointer = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? "/" : `/${path.map((segment) => String(segment)).join("/")}`

const aiErrorShape = (
  kind: "ai_disabled" | "not_configured" | "upstream_failed" | "unusable_result",
): Readonly<{ status: number; type: string; title: string }> => {
  if (kind === "ai_disabled" || kind === "not_configured") {
    return { status: 409, type: PROBLEM_TYPES.conflict, title: "AI Not Ready" }
  }
  if (kind === "unusable_result") {
    return { status: 502, type: PROBLEM_TYPES.upstreamError, title: "AI Model Failed" }
  }
  return { status: 502, type: PROBLEM_TYPES.upstreamError, title: "AI Endpoint Failed" }
}

export const aiRoutes: FastifyPluginAsync<AiRoutesOptions> = async (fastify, options) => {
  const { ai } = options

  fastify.get(aiPresetsPath, async (_request, reply) => {
    return reply.send(AiPresetsSchema.parse({ presets: ai.listPresets() }))
  })

  fastify.get(aiConfigPath, async (_request, reply) => {
    return reply.send(await ai.getConfig())
  })

  fastify.put(aiConfigPath, async (request, reply) => {
    const parsed = AiConfigPatchSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(
        reply,
        problem(
          400,
          PROBLEM_TYPES.validationError,
          "Validation Error",
          "AI config failed validation",
          parsed.error.issues.map((issue) => ({
            pointer: issuePointer(issue.path),
            code: issue.code,
          })),
        ),
      )
    }
    return reply.send(await ai.saveConfig(parsed.data))
  })

  fastify.get(aiModelsPath, async (request, reply) => {
    const parsed = WriterScopeSchema.safeParse((request.query as { scope?: unknown }).scope)
    if (!parsed.success) {
      return sendProblem(
        reply,
        problem(
          400,
          PROBLEM_TYPES.validationError,
          "Validation Error",
          "scope must be style, lyrics, or visuals",
          [{ pointer: "/scope", code: "invalid" }],
        ),
      )
    }
    const result = await ai.fetchModels(parsed.data)
    return reply.send(AiModelsSchema.parse(result))
  })

  fastify.post(aiEnhancePath, async (request, reply) => {
    const parsed = EnhanceBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(
        reply,
        problem(
          400,
          PROBLEM_TYPES.validationError,
          "Validation Error",
          "Enhance body failed validation",
          parsed.error.issues.map((issue) => ({
            pointer: issuePointer(issue.path),
            code: issue.code,
          })),
        ),
      )
    }

    const result = await ai.enhance({
      kind: parsed.data.kind,
      style: parsed.data.style ?? "",
      lyrics: parsed.data.lyrics ?? "",
    })
    if (!result.ok) {
      const shape = aiErrorShape(result.error.kind)
      return sendProblem(reply, problem(shape.status, shape.type, shape.title, result.error.detail))
    }
    return reply.send(EnhanceResultSchema.parse({ text: result.value }))
  })

  fastify.post(aiRandomSongPath, async (_request, reply) => {
    const result = await ai.randomSong()
    if (!result.ok) {
      const shape = aiErrorShape(result.error.kind)
      return sendProblem(reply, problem(shape.status, shape.type, shape.title, result.error.detail))
    }
    return reply.status(201).send(toSongResponse(result.value))
  })
}
