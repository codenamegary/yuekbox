import { FastifyPluginAsync } from "fastify"
import {
  ModelDownloadSnapshotSchema,
  ModelDownloadStartSchema,
  ModelDownloadsSchema,
  ModelKeySchema,
  modelsDownloadsPath,
  modelsPath,
} from "contracts/http/models"
import {
  confirmationRequiredProblem,
  issuePointer,
  modelPathExternalProblem,
  notFoundProblem,
  sendProblem,
  validationProblem,
} from "../shared/problems"
import { ModelDownloads } from "./models.downloads"

export type ModelsRoutesOptions = Readonly<{ downloads: ModelDownloads }>

/**
 * Model download endpoints. Starting one is explicit: the body carries the
 * user's confirmation for a download over the threshold, the response is the
 * running snapshot, and polling reads the same snapshot back.
 */
export const modelsRoutes: FastifyPluginAsync<ModelsRoutesOptions> = async (fastify, options) => {
  fastify.get(modelsDownloadsPath, async (_request, reply) =>
    reply.send(ModelDownloadsSchema.parse({ items: await options.downloads.readAll() })),
  )

  fastify.get<{ Params: { key: string } }>(
    `${modelsPath}/:key/download`,
    async (request, reply) => {
      const key = ModelKeySchema.safeParse(request.params.key)
      if (!key.success) {
        return sendProblem(reply, notFoundProblem(`model ${request.params.key} does not exist`))
      }
      return reply.send(ModelDownloadSnapshotSchema.parse(await options.downloads.read(key.data)))
    },
  )

  fastify.post<{ Params: { key: string } }>(
    `${modelsPath}/:key/download`,
    async (request, reply) => {
      const key = ModelKeySchema.safeParse(request.params.key)
      if (!key.success) {
        return sendProblem(reply, notFoundProblem(`model ${request.params.key} does not exist`))
      }

      const parsed = ModelDownloadStartSchema.safeParse(request.body ?? {})
      if (!parsed.success) {
        return sendProblem(
          reply,
          validationProblem(
            parsed.error.issues.map((issue) => ({
              pointer: issuePointer(issue.path),
              code: issue.code,
            })),
            "download request failed validation",
          ),
        )
      }

      const result = await options.downloads.start({ key: key.data, confirm: parsed.data.confirm })
      if (!result.ok) {
        switch (result.error.kind) {
          case "confirmation_required":
            return sendProblem(
              reply,
              confirmationRequiredProblem({
                expectedBytes: result.error.expectedBytes,
                thresholdBytes: result.error.thresholdBytes,
              }),
            )
          case "path_outside_home":
            return sendProblem(
              reply,
              modelPathExternalProblem({ key: result.error.key, path: result.error.path }),
            )
        }
      }

      const snapshot = ModelDownloadSnapshotSchema.parse(result.value)
      return reply.status(snapshot.state === "present" ? 200 : 202).send(snapshot)
    },
  )
}
