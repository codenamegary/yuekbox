import { ReferenceUploadQuerySchema } from "contracts/http/references"
import { err, ok, Result } from "../shared/result"
import { CreateReferenceError, CreateReferenceInput, Reference } from "./songs.models"
import { InsertReference } from "./songs.ports"

export type CreateReferenceDeps = Readonly<{
  putReferenceAudio: (
    referenceId: string,
    audio: Uint8Array,
    contentType: string,
  ) => Promise<number>
  insertReference: InsertReference
  removeReferenceAudio: (referenceId: string, contentType: string) => Promise<void>
  now: () => string
  generateId: () => string
}>

export const makeCreateReference =
  (deps: CreateReferenceDeps) =>
  async (input: CreateReferenceInput): Promise<Result<Reference, CreateReferenceError>> => {
    const parsed = ReferenceUploadQuerySchema.safeParse({ filename: input.filename })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const pointer =
        issue !== undefined && issue.path.length > 0 ? `/${issue.path.join("/")}` : "/"
      return err({ kind: "validation_error", pointer, code: issue?.code ?? "invalid" })
    }

    const id = deps.generateId()
    const byteLength = await deps.putReferenceAudio(id, input.audio, input.contentType)
    try {
      const reference = await deps.insertReference({
        id,
        filename: parsed.data.filename,
        contentType: input.contentType,
        byteLength,
        createdAt: deps.now(),
      })
      return ok(reference)
    } catch (error: unknown) {
      await deps.removeReferenceAudio(id, input.contentType).catch(() => undefined)
      throw error
    }
  }
