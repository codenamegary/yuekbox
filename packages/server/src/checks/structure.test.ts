import { describe, expect, test } from "bun:test"
import { checkNoLet, checkStructure } from "./structure"

describe("checkNoLet", () => {
  test("flags a let declaration anywhere in the file", () => {
    const source = `export const makeThing = (deps: Deps) => {
  let count = 0
  return async (input: Input) => {
    count += 1
    return deps.run(input, count)
  }
}`

    expect(checkNoLet("thing.usecase.ts", source)).toHaveLength(1)
  })

  test("accepts const bindings, including mutated objects and for-of entries", () => {
    const source = `export const makeThing = (deps: Deps) => {
  const seen = new Set<string>()
  return async (input: Input) => {
    seen.add(input.id)
    for (const [index, id] of [...seen].entries()) deps.note(index, id)
    return deps.run(input)
  }
}`

    expect(checkNoLet("thing.usecase.ts", source)).toEqual([])
  })

  test("a declaration line marked structure: allow-let is the accepted exception", () => {
    const source = `export const makeCursor = () => {
  let cursor = 0 // structure: allow-let
  return (bytes: number) => {
    cursor += bytes
    return cursor
  }
}`

    expect(checkNoLet("cursor.ts", source)).toEqual([])
  })

  test("the marker only excuses its own line", () => {
    const source = `export const makeCursor = () => {
  let cursor = 0
  let other = 0 // structure: allow-let
  return () => cursor + other
}`

    expect(checkNoLet("cursor.ts", source)).toHaveLength(1)
  })
})

describe("checkStructure use case files", () => {
  test("flags a use case file whose factory is not curried", () => {
    const source = `export const makeThing = (deps: Deps) => deps.run`

    expect(checkStructure("songs.create.usecase.ts", source)).toHaveLength(1)
  })

  test("accepts a curried factory", () => {
    const source = `export const makeThing = (deps: Deps) => async (input: Input) => deps.run(input)`

    expect(checkStructure("songs.create.usecase.ts", source)).toEqual([])
  })

  test("accepts a block-body factory that returns a function", () => {
    const source = `export const makeThing = (deps: Deps) => {
  return async (input: Input) => deps.run(input)
}`

    expect(checkStructure("songs.create.usecase.ts", source)).toEqual([])
  })

  test("flags a use case file with no make factory", () => {
    const source = `export type ThingDeps = Readonly<{ run: () => Promise<void> }>`

    expect(checkStructure("songs.create.usecase.ts", source)).toHaveLength(1)
  })

  test("ignores files that are not use cases", () => {
    expect(checkStructure("songs.ports.ts", `export const thing = 1`)).toEqual([])
  })
})

describe("checkStructure ports files", () => {
  test("flags a record bundling two functions", () => {
    const source = `export type AudioStore = Readonly<{
  put: (key: string, audio: Uint8Array) => Promise<void>
  read: (key: string) => Promise<Uint8Array | null>
}>`

    expect(checkStructure("songs.ports.ts", source)).toHaveLength(1)
  })

  test("accepts atomic function types and data records", () => {
    const source = `export type FindSongById = (songId: string) => Promise<Song | null>

export type ListSongsQuery = Readonly<{
  limit: number
  statuses: readonly SongStatus[]
}>

export type SongAudioRecord = Readonly<{
  songId: string
  read: (range: ByteRange | null) => Promise<Uint8Array>
}>`

    expect(checkStructure("songs.ports.ts", source)).toEqual([])
  })

  test("flags a method-style record too", () => {
    const source = `export type AudioStore = Readonly<{
  put(key: string): Promise<void>
  read(key: string): Promise<Uint8Array | null>
}>`

    expect(checkStructure("songs.ports.ts", source)).toHaveLength(1)
  })

  test("ignores multi-function records outside ports files", () => {
    const source = `export type AudioStore = Readonly<{
  put: (key: string) => Promise<void>
  read: (key: string) => Promise<Uint8Array | null>
}>`

    expect(checkStructure("songs.models.ts", source)).toEqual([])
  })
})
