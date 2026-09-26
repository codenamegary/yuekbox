import { ReadinessSchema, readinessPath } from "contracts/http/readiness"
import { FastifyPluginAsync } from "fastify"
import { ReadinessReader } from "./readiness.models"

export type ReadinessRoutesOptions = Readonly<{ readReadiness: ReadinessReader }>

/** Model + system readiness, informational only. */
export const readinessRoutes: FastifyPluginAsync<ReadinessRoutesOptions> = async (
  fastify,
  options,
) => {
  fastify.get(readinessPath, async (_request, reply) =>
    reply.send(ReadinessSchema.parse(await options.readReadiness())),
  )
}
