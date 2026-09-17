import { expect, test } from "bun:test"
import { z } from "zod"
import { createCollectionSchema } from "./collection"

const ItemSchema = z.strictObject({ id: z.string() })
const ItemsSchema = createCollectionSchema(ItemSchema)

test("parses a collection fixture", () => {
  const fixture = {
    items: [{ id: "one" }, { id: "two" }],
    page: { limit: 20, nextCursor: "cursor-a", count: 2 },
  }
  expect(ItemsSchema.parse(fixture)).toEqual(fixture)
})

test("parses an empty final page", () => {
  const fixture = { items: [], page: { limit: 20, previousCursor: "cursor-z" } }
  expect(ItemsSchema.parse(fixture)).toEqual(fixture)
})

test("rejects a collection without page info", () => {
  const result = ItemsSchema.safeParse({ items: [] })
  expect(result.success).toBe(false)
})

test("rejects items that violate the item schema", () => {
  const result = ItemsSchema.safeParse({ items: [{ id: 1 }], page: { limit: 1 } })
  expect(result.success).toBe(false)
})
