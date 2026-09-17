import { songAudioPath } from "contracts/http/songs"

export const songDownloadHref = (songId: string): string => songAudioPath(songId)

export const mp3FileName = (songId: string): string => `yuekbox-${songId}.mp3`
