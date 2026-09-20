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
import { Reference, ReferenceSchema, referencesPath } from "contracts/http/references"
import {
  SongVisualization,
  SongVisualizationSchema,
  songVisualizationPath,
} from "contracts/http/visualizations"
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

/**
 * The Song's visualization, or null when it has none. The server answers 404
 * for both an unknown Song and a Song with no visual; the caller already knows
 * the Song exists.
 */
export const fetchSongVisualization = async (songId: string): Promise<SongVisualization | null> => {
  const response = await fetch(songVisualizationPath(songId))
  if (response.status === 404) return null
  return parseJson(response, (value) => SongVisualizationSchema.parse(value))
}

export const requestSongVisualization = async (songId: string): Promise<void> => {
  const response = await fetch(songVisualizationPath(songId), { method: "POST" })
  if (!response.ok) {
    throw new Error(await toErrorMessage(response))
  }
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

export const referenceUploadUrl = (filename: string): string =>
  `${referencesPath}?${new URLSearchParams({ filename }).toString()}`

export const uploadReference = async (file: File): Promise<Reference> => {
  const response = await fetch(referenceUploadUrl(file.name), {
    method: "POST",
    headers: { "content-type": file.type === "" ? "application/octet-stream" : file.type },
    body: file,
  })
  return parseJson(response, (value) => ReferenceSchema.parse(value))
}
