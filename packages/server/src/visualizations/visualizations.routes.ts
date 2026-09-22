import { FastifyPluginAsync } from "fastify"
import { UlidSchema } from "contracts/http/primitives"
import { songsPath } from "contracts/http/songs"
import { SongVisualizationResponseSchema } from "contracts/http/visualizations"
import { conflictProblem, notFoundProblem, sendProblem } from "../shared/problems"
import { VisualizationsSlice } from "./visualizations.assembly"

export type VisualizationsRoutesOptions = Readonly<{
  visualizations: VisualizationsSlice
}>

const visualizationRoute = `${songsPath}/:songId/visualization`

export const visualizationsRoutes: FastifyPluginAsync<VisualizationsRoutesOptions> = async (
  fastify,
  options,
) => {
  const { visualizations } = options

  fastify.get<{ Params: { songId: string } }>(visualizationRoute, async (request, reply) => {
    const songId = request.params.songId
    if (!UlidSchema.safeParse(songId).success) {
      return sendProblem(reply, notFoundProblem(`Song ${songId} does not exist`))
    }

    const result = await visualizations.getVisualization(songId)
    if (!result.ok) {
      return sendProblem(reply, notFoundProblem(`Song ${songId} does not exist`))
    }

    return reply.send(SongVisualizationResponseSchema.parse(result.value))
  })

  fastify.post<{ Params: { songId: string } }>(visualizationRoute, async (request, reply) => {
    const songId = request.params.songId
    if (!UlidSchema.safeParse(songId).success) {
      return sendProblem(reply, notFoundProblem(`Song ${songId} does not exist`))
    }

    const result = await visualizations.requestVisualization(songId)
    if (!result.ok) {
      if (result.error.kind === "not_found") {
        return sendProblem(reply, notFoundProblem(`Song ${songId} does not exist`))
      }
      return sendProblem(reply, conflictProblem(result.error.detail))
    }

    return reply.status(202).send()
  })
}
