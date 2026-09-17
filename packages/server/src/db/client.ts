import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import * as schema from "./db.schema"

export type Db = ReturnType<typeof drizzle<typeof schema>>

export type DatabaseHandle = Readonly<{
  db: Db
  sqlite: Database
  path: string
  close: () => void
}>

export type OpenDatabaseOptions = Readonly<{
  path: string
}>

const migrationsFolder = path.join(import.meta.dir, "migrations")

export const openDatabase = (options: OpenDatabaseOptions): DatabaseHandle => {
  if (options.path !== ":memory:") {
    mkdirSync(path.dirname(options.path), { recursive: true })
  }

  const sqlite = new Database(options.path)
  sqlite.run("PRAGMA journal_mode = WAL")
  sqlite.run("PRAGMA foreign_keys = ON")
  sqlite.run("PRAGMA busy_timeout = 5000")

  const db = drizzle({ client: sqlite, schema })

  try {
    migrate(db, { migrationsFolder })
  } catch (error: unknown) {
    sqlite.close()
    throw error
  }

  return {
    db,
    sqlite,
    path: options.path,
    close: () => {
      sqlite.close()
    },
  }
}
