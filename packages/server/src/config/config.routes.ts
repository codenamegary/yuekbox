import { FastifyPluginAsync } from "fastify"
import { ConfigPatchSchema, configPath, ModelPathOverrides } from "contracts/http/config"
import { issuePointer, sendProblem, validationProblem } from "../shared/problems"
import { makeGetConfig } from "./config.get.usecase"
import { makeUpdateConfig } from "./config.update.usecase"
import { makeLoadModelOverrides, makeSaveModelOverrides } from "./config.yaml.adapters"

export type ConfigRoutesOptions = Readonly<{
  /** yuekbox home; model defaults resolve under it. */
  home: string
  /** The config.yaml path, normally `<home>/config.yaml`. */
  configFilePath: string
  /** CLI model overrides, boot-time and highest precedence. */
  flags: ModelPathOverrides
}>

/** The only user-configurable surface: where the five model files live. */
export const configRoutes: FastifyPluginAsync<ConfigRoutesOptions> = async (fastify, options) => {
  const loadModelOverrides = makeLoadModelOverrides(options.configFilePath)

  const getConfig = makeGetConfig({
    loadModelOverrides,
    home: options.home,
    flags: options.flags,
  })
  const updateConfig = makeUpdateConfig({
    loadModelOverrides,
    saveModelOverrides: makeSaveModelOverrides(options.configFilePath),
    home: options.home,
    flags: options.flags,
  })

  fastify.get(configPath, async (_request, reply) => reply.send(await getConfig()))

  fastify.put(configPath, async (request, reply) => {
    const parsed = ConfigPatchSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(
        reply,
        validationProblem(
          parsed.error.issues.map((issue) => ({
            pointer: issuePointer(issue.path),
            code: issue.code,
          })),
          "model paths failed validation",
        ),
      )
    }
    return reply.send(await updateConfig(parsed.data))
  })
}
