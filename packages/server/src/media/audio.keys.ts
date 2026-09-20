export const songAudioKey = (songId: string): string => `songs/${songId}.mp3`

const extensionsByContentType: Record<string, string> = {
  "application/octet-stream": ".bin",
  "audio/aac": ".aac",
  "audio/flac": ".flac",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/opus": ".opus",
  "audio/wav": ".wav",
  "audio/wave": ".wav",
  "audio/webm": ".webm",
  "audio/x-flac": ".flac",
  "audio/x-m4a": ".m4a",
  "audio/x-wav": ".wav",
}

export const extensionForContentType = (contentType: string): string =>
  extensionsByContentType[contentType.toLowerCase()] ?? ".bin"

export const referenceAudioKey = (referenceId: string, contentType: string): string =>
  `references/${referenceId}${extensionForContentType(contentType)}`
