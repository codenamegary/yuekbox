import { expect, test } from "bun:test"
import { makeRemoveMediaById } from "./songs.media.remove.usecase"

test("removeMediaById unlinks only files for that role and id", async () => {
  const id = "01J8K3R4P9ABCDEFGHJKMNPQRS"
  const otherId = "01J8K3R4P9ABCDEFGHJKMNPQRT"
  const removed: string[] = []
  const removeMediaById = makeRemoveMediaById({
    listMediaFiles: async () => [
      `songs/amazing-awesome-song_${id}.mp3`,
      `songs/${id}.mp3`,
      `references/${id}.mp3`,
      `songs/other-song_${otherId}.mp3`,
      "songs/junk.txt",
    ],
    removeAudio: async (key) => {
      removed.push(key)
    },
  })

  await removeMediaById("song", id)

  expect(removed).toEqual([`songs/amazing-awesome-song_${id}.mp3`, `songs/${id}.mp3`])
})
