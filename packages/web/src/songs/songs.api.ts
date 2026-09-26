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
  SongVisualizationResponse,
  SongVisualizationResponseSchema,
  songVisualizationPath,
} from "contracts/http/visualizations"
import { parseJson } from "@/lib/http"
import { toProblemError } from "@/lib/problems"

export const fetchSongs = async (): Promise<SongsCollection> => {
  const response = await fetch(`${songsPath}?limit=50`)
  return parseJson(response, (value) => SongsCollectionSchema.parse(value))
}

export const fetchSong = async (songId: string): Promise<Song> => {
  const response = await fetch(songPath(songId))
  return parseJson(response, (value) => SongSchema.parse(value))
}

/**
 * The Song's visualization and its measured analysis. The server answers 404
 * only for an unknown Song; a Song without either returns null fields.
 */
export const fetchSongVisualization = async (
  songId: string,
): Promise<SongVisualizationResponse> => {
  const response = await fetch(songVisualizationPath(songId))
  return parseJson(response, (value) => SongVisualizationResponseSchema.parse(value))
}

export const requestSongVisualization = async (songId: string): Promise<void> => {
  const response = await fetch(songVisualizationPath(songId), { method: "POST" })
  if (!response.ok) throw await toProblemError(response)
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
  if (!response.ok) throw await toProblemError(response)
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
