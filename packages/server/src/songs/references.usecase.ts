import { ReferenceUploadQuerySchema } from "contracts/http/references"
import { PutFile } from "../media/media.ports"
import { err, ok, Result } from "../shared/result"
import {
  parseReferenceFileName,
  referenceFileName,
  referenceStemFromUpload,
  uploadDirectoryName,
} from "./songs.files"
import { CreateReferenceError, CreateReferenceInput, Reference } from "./songs.models"

export type CreateReferenceDeps = Readonly<{
  putFile: PutFile
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

    const referenceId = deps.generateId()
    const stem = referenceStemFromUpload(parsed.data.filename)
    const fileName = referenceFileName(stem, referenceId, input.contentType)
    const byteLength = await deps.putFile(`${uploadDirectoryName}/${fileName}`, input.audio)
    const parts = parseReferenceFileName(fileName)

    return ok(
      Object.freeze({
        id: referenceId,
        filename: parts?.displayName ?? fileName,
        contentType: input.contentType,
        byteLength,
        createdAt: deps.now(),
      }),
    )
  }
