export type ListCursor = Readonly<{ createdAt: string; id: string }>

export const encodeCursor = (cursor: ListCursor): string =>
  Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString("base64url")

export const decodeCursor = (raw: string): ListCursor | null => {
  const decoded = Buffer.from(raw, "base64url").toString("utf8")
  const separator = decoded.indexOf("|")
  if (separator <= 0) return null
  const createdAt = decoded.slice(0, separator)
  const id = decoded.slice(separator + 1)
  if (createdAt.length === 0 || id.length === 0) return null
  return { createdAt, id }
}
