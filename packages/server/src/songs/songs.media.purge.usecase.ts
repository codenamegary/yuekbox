import { DeleteStaleReferences } from "./songs.ports"

export type PurgeStaleReferencesDeps = Readonly<{
  deleteStaleReferences: DeleteStaleReferences
  removeReferenceAudio: (referenceId: string, contentType: string) => Promise<void>
}>

export const makePurgeStaleReferences =
  (deps: PurgeStaleReferencesDeps) =>
  async (createdBefore: string): Promise<number> => {
    const deleted = await deps.deleteStaleReferences(createdBefore)
    await Promise.all(
      deleted.map((reference) => deps.removeReferenceAudio(reference.id, reference.contentType)),
    )
    return deleted.length
  }
