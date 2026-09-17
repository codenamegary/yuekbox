import { expect, test } from "bun:test"
import { Status, StatusSchema, statusPath } from "./status"

test("statusPath is /v1/status", () => {
  expect(statusPath).toBe("/v1/status")
})

test("parses a status fixture", () => {
  const fixture: Status = {
    version: "0.1.0",
    state: "online",
    ffmpeg: "ok",
    yue2: "ok",
    queueDepth: 2,
    gpuBusy: true,
    startedAt: "2026-09-17T04:00:00.000Z",
  }
  expect(StatusSchema.parse(fixture)).toEqual(fixture)
})

test("parses a status fixture with missing dependencies", () => {
  const fixture: Status = {
    version: "0.1.0",
    state: "starting",
    ffmpeg: "missing",
    yue2: "missing",
    queueDepth: 0,
    gpuBusy: false,
    startedAt: "2026-09-17T04:00:00.000Z",
  }
  expect(StatusSchema.parse(fixture)).toEqual(fixture)
})

test("rejects an unknown state", () => {
  const result = StatusSchema.safeParse({
    version: "0.1.0",
    state: "offline",
    ffmpeg: "ok",
    yue2: "ok",
    queueDepth: 0,
    gpuBusy: false,
    startedAt: "2026-09-17T04:00:00.000Z",
  })
  expect(result.success).toBe(false)
})
