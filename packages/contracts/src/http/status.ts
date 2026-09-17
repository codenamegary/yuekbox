import { z } from "zod"
import { TimestampSchema } from "./primitives"

export const statusPath = "/v1/status"

export const ServiceStateSchema = z.enum(["starting", "online", "shutting_down"])

export const DependencyStateSchema = z.enum(["ok", "missing"])

export const StatusSchema = z.strictObject({
  version: z.string().min(1),
  state: ServiceStateSchema,
  ffmpeg: DependencyStateSchema,
  yue2: DependencyStateSchema,
  queueDepth: z.number().int().nonnegative(),
  gpuBusy: z.boolean(),
  startedAt: TimestampSchema,
})

export type ServiceState = z.infer<typeof ServiceStateSchema>
export type DependencyState = z.infer<typeof DependencyStateSchema>
export type Status = z.infer<typeof StatusSchema>
