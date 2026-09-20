import { FindReferenceAudioBySongId, FindReferenceBySongId } from "./songs.ports"

export type FindReferenceAudioBySongIdDeps = Readonly<{
  findReferenceBySongId: FindReferenceBySongId
  resolveReferenceAudioPath: (referenceId: string, contentType: string) => string
}>

export const makeFindReferenceAudioBySongId =
  (deps: FindReferenceAudioBySongIdDeps): FindReferenceAudioBySongId =>
  async (songId) => {
    const reference = await deps.findReferenceBySongId(songId)
    if (reference === null) return null
    return {
      reference,
      audioPath: deps.resolveReferenceAudioPath(reference.id, reference.contentType),
    }
  }
