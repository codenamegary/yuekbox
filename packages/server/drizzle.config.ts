import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/db.schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: "file:./data/yuekbox.sqlite",
  },
})
