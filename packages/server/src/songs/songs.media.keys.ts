export const songTitleFromLyrics = (lyrics: string): string => {
  const firstSungLine = lyrics
    .split("\n")
    .map((line) => line.replace(/\[[^\]]*\]/g, "").trim())
    .find((line) => line !== "")
  if (firstSungLine === undefined) return "untitled"

  const slug = firstSungLine
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
  return slug === "" ? "untitled" : slug
}

const titlePrefix = (title: string | null): string => (title === null ? "" : `${title}_`)

export const songAudioKey = (songId: string, title: string | null): string =>
  `songs/${titlePrefix(title)}${songId}.mp3`

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

export const referenceAudioKey = (
  referenceId: string,
  contentType: string,
  title: string | null,
): string => `references/${titlePrefix(title)}${referenceId}${extensionForContentType(contentType)}`

const ulidSuffix = /(?:^|[\s_-])([0-9a-hjkmnp-tv-z]{26})$/i

export const mediaIdFromFileName = (fileName: string): string | null => {
  const stem = fileName.replace(/\.[^.]+$/, "")
  const match = ulidSuffix.exec(stem)
  return match?.[1]?.toUpperCase() ?? null
}

export type MediaFileRef = Readonly<{
  role: "song" | "reference"
  id: string
}>

const rolesByDirectory: Record<string, "song" | "reference"> = {
  references: "reference",
  songs: "song",
}

export const parseMediaKey = (key: string): MediaFileRef | null => {
  const parts = key.split("/")
  if (parts.length !== 2) return null
  const role = rolesByDirectory[parts[0] ?? ""]
  const id = mediaIdFromFileName(parts[1] ?? "")
  if (role === undefined || id === null) return null
  return Object.freeze({ role, id })
}
