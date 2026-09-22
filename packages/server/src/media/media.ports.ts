export type StoredFile = Readonly<{
  path: string
  byteLength: number
}>

export type MakeDirectory = (key: string) => Promise<void>

export type PutFile = (key: string, bytes: Uint8Array) => Promise<number>

export type StatFile = (key: string) => Promise<StoredFile | null>

export type ReadFile = (key: string) => Promise<Uint8Array | null>

export type OpenFileRange = (key: string, start: number, end: number) => Promise<Uint8Array | null>

export type MoveFile = (fromKey: string, toKey: string) => Promise<void>

export type RemoveFile = (key: string) => Promise<void>

export type RemoveDirectory = (key: string) => Promise<void>

export type FindFiles = (pattern: string) => Promise<readonly string[]>

/**
 * Copies an existing directory from the host filesystem into the media store
 * under `key`. Used to keep a tool's raw output tree beside the Song.
 */
export type CopyDirectory = (sourcePath: string, key: string) => Promise<void>
