import { SongStatus } from "contracts/http/songs"
import { err, ok, Result } from "../shared/result"
import { decodeCursor } from "./songs.cursor"
import { ListSongsError, SongsPage } from "./songs.models"
import { ListSongs } from "./songs.ports"

export type ListSongsInput = Readonly<{
  limit: number
  cursor: string | null
  statuses: readonly SongStatus[]
}>

export type ListSongsDeps = Readonly<{
  listSongs: ListSongs
}>

export const makeListSongs =
  (deps: ListSongsDeps) =>
  async (input: ListSongsInput): Promise<Result<SongsPage, ListSongsError>> => {
    const cursor = input.cursor === null ? null : decodeCursor(input.cursor)
    if (input.cursor !== null && cursor === null) {
      return err({ kind: "invalid_cursor" })
    }

    const page = await deps.listSongs({
      limit: input.limit,
      cursor,
      statuses: input.statuses,
    })

    return ok(page)
  }
