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

export const songFolderName = (title: string, songId: string): string => `${title}_${songId}`

export const songFolderPattern = (songId: string): string => `*_${songId}`

const folderIdPattern = /_([0-9A-HJKMNP-TV-Z]{26})$/

export const songIdFromFolderName = (folderName: string): string | null =>
  folderIdPattern.exec(folderName)?.[1] ?? null

const unsafeNameCharacter = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0
  return code < 0x20 || code === 0x7f || '\\/:*?"<>|'.includes(character)
}

const replaceUnsafeCharacters = (value: string): string =>
  Array.from(value)
    .map((character) => (unsafeNameCharacter(character) ? "-" : character))
    .join("")

export const referenceStemFromUpload = (uploadedName: string): string => {
  const withoutExtension = uploadedName.replace(/\.[^.]*$/, "")
  const cleaned = replaceUnsafeCharacters(withoutExtension)
    .replace(/^[.\s]+/, "")
    .trim()
  const capped = cleaned.slice(0, 120).trim()
  return capped === "" ? "reference" : capped
}

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

export const referenceFileName = (stem: string, referenceId: string, contentType: string): string =>
  `${stem}_${referenceId}${extensionForContentType(contentType)}`

const referenceSuffixPattern = /_([0-9A-HJKMNP-TV-Z]{26})(\.[^./]*)?$/i

export type ReferenceFileNameParts = Readonly<{
  id: string
  displayName: string
}>

export const parseReferenceFileName = (fileName: string): ReferenceFileNameParts | null => {
  const match = referenceSuffixPattern.exec(fileName)
  if (match === null) return null
  const id = match[1]
  if (id === undefined) return null
  const stem = fileName.slice(0, match.index)
  if (stem === "") return null
  return Object.freeze({ id: id.toUpperCase(), displayName: `${stem}${match[2] ?? ""}` })
}

export const generatedAudioFileName = (songId: string): string => `generated_${songId}.mp3`

export const scoreFileName = "score.abc"

export const referenceScoreFileName = "reference_score.abc"

export const referencesDirectoryName = "references"

export const uploadDirectoryName = "temp"

export const uploadPattern = (referenceId: string): string =>
  `${uploadDirectoryName}/*_${referenceId.toUpperCase()}.*`

export const referencesDirectoryKey = (folderKey: string): string =>
  `${folderKey}/${referencesDirectoryName}`

export const referenceFilesPattern = (folderKey: string): string =>
  `${referencesDirectoryKey(folderKey)}/*`

export const referenceFileKey = (folderKey: string, fileName: string): string =>
  `${referencesDirectoryKey(folderKey)}/${fileName}`

export const generatedAudioKey = (folderKey: string, songId: string): string =>
  `${folderKey}/${generatedAudioFileName(songId)}`

export const scoreKey = (folderKey: string): string => `${folderKey}/${scoreFileName}`

export const referenceScoreKey = (folderKey: string): string =>
  `${folderKey}/${referenceScoreFileName}`
