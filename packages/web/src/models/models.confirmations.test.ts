import { expect, test } from "bun:test"
import { modelKeyOrder } from "contracts/http/models"
import { makeDownloadConfirmations } from "./models.confirmations"

const makeStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value)
    },
  }
}

test("a model is unconfirmed until its download is remembered", () => {
  const confirmations = makeDownloadConfirmations(makeStorage())

  expect(confirmations.confirmed("yue2")).toBe(false)
  confirmations.remember("yue2")
  expect(confirmations.confirmed("yue2")).toBe(true)
  expect(confirmations.confirmed("whisper")).toBe(false)
})

test("every model key gets its own entry", () => {
  const confirmations = makeDownloadConfirmations(makeStorage())

  for (const key of modelKeyOrder) {
    expect(confirmations.confirmed(key)).toBe(false)
    confirmations.remember(key)
    expect(confirmations.confirmed(key)).toBe(true)
  }
})
