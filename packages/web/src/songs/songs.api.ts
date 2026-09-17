import {
  CreateSongBody,
  Song,
  SongSchema,
  SongsCollection,
  SongsCollectionSchema,
  songsPath,
  songAudioPath,
  songPath,
} from "contracts/http/songs"
import { Status, StatusSchema, statusPath } from "contracts/http/status"
import { ProblemDetailsSchema } from "contracts/http/error"

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const problem = ProblemDetailsSchema.safeParse(await response.json())
    if (problem.success) {
      return problem.data.detail ?? problem.data.title
    }
  } catch {
    // fall through to a generic message
  }
  return `Request failed with status ${response.status}`
}

const parseJson = async <T>(response: Response, parse: (value: unknown) => T): Promise<T> => {
  if (!response.ok) {
    throw new Error(await toErrorMessage(response))
  }
  return parse(await response.json())
}

export const fetchSongs = async (): Promise<SongsCollection> => {
  const response = await fetch(`${songsPath}?limit=50`)
  return parseJson(response, (value) => SongsCollectionSchema.parse(value))
}

export const fetchSong = async (songId: string): Promise<Song> => {
  const response = await fetch(songPath(songId))
  return parseJson(response, (value) => SongSchema.parse(value))
}

export const createSong = async (body: CreateSongBody): Promise<Song> => {
  const response = await fetch(songsPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return parseJson(response, (value) => SongSchema.parse(value))
}

export const deleteSong = async (songId: string): Promise<void> => {
  const response = await fetch(songPath(songId), { method: "DELETE" })
  if (!response.ok) {
    throw new Error(await toErrorMessage(response))
  }
}

export const fetchStatus = async (): Promise<Status> => {
  const response = await fetch(statusPath)
  return parseJson(response, (value) => StatusSchema.parse(value))
}

export const songAudioSource = songAudioPath
