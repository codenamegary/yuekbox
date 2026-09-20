import { MediaFileRef, parseMediaKey } from "./songs.media.keys"
import { ListMediaFiles, RemoveAudio } from "./songs.ports"

export type RemoveMediaByIdDeps = Readonly<{
  listMediaFiles: ListMediaFiles
  removeAudio: RemoveAudio
}>

export const makeRemoveMediaById =
  (deps: RemoveMediaByIdDeps) =>
  async (role: MediaFileRef["role"], id: string): Promise<void> => {
    const files = await deps.listMediaFiles()
    const matching = files.filter((file) => {
      const match = parseMediaKey(file)
      return match !== null && match.role === role && match.id === id
    })
    await Promise.all(matching.map((file) => deps.removeAudio(file)))
  }
