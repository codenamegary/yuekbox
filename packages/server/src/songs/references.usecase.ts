import { ReferenceUploadQuerySchema } from "contracts/http/references"
import { err, ok, Result } from "../shared/result"
import { CreateReferenceError, CreateReferenceInput, Reference } from "./songs.models"
import { InsertReference } from "./songs.ports"

export type CreateReferenceDeps = Readonly<{
  insertReference: InsertReference
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

    const reference = await deps.insertReference({
      id: deps.generateId(),
      filename: parsed.data.filename,
      contentType: input.contentType,
      audio: input.audio,
      createdAt: deps.now(),
    })

    return ok(reference)
  }
