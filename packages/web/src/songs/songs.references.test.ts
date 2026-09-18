import { expect, test } from "bun:test"
import { referenceUploadUrl } from "./songs.api"

test("reference upload url encodes the filename as a query parameter", () => {
  expect(referenceUploadUrl("demo song.mp3")).toBe("/v1/references?filename=demo+song.mp3")
})

test("reference upload url escapes separators", () => {
  expect(referenceUploadUrl("a&b=c.mp3")).toBe("/v1/references?filename=a%26b%3Dc.mp3")
})
