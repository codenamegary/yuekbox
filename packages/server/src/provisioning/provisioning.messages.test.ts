import { expect, test } from "bun:test"
import { ProvisionFailure, ProvisionFailureKind, provisionStepLabels } from "./provisioning.models"
import { provisionFailureMessage } from "./provisioning.messages"

const failure = (
  step: ProvisionFailure["step"],
  kind: ProvisionFailureKind,
  detail = "internal detail",
): ProvisionFailure => ({ step, kind, label: provisionStepLabels[step], detail })

const everyKind: readonly ProvisionFailure[] = [
  failure("uv", "uv_unavailable"),
  failure("python", "python_unavailable"),
  failure("gpu", "gpu_missing"),
  failure("gpu", "gpu_driver_too_old"),
  failure("gpu", "gpu_unreadable"),
  failure("yue2", "venv_failed"),
  failure("sheetsage2", "venv_failed"),
  failure("lyricalign", "venv_failed"),
  failure("scripts", "scripts_failed"),
]

const forbidden = /\b(venv|pip|interpreter|package|python|stack|trace)/i

test("every failure maps to plain English with no implementation words", () => {
  for (const input of everyKind) {
    const message = provisionFailureMessage(input)

    expect(message).not.toMatch(forbidden)
    expect(message.length).toBeGreaterThan(20)
  }
})

test("every failure offers a retry", () => {
  for (const input of everyKind) {
    expect(provisionFailureMessage(input).toLowerCase()).toContain("try again")
  }
})

test("the step labels carry no implementation words either", () => {
  for (const label of Object.values(provisionStepLabels)) {
    expect(label).not.toMatch(forbidden)
  }
})

test("the internal detail never reaches the user message", () => {
  const message = provisionFailureMessage(
    failure("yue2", "venv_failed", "uv exited 2: could not resolve torch"),
  )

  expect(message).not.toContain("uv exited")
  expect(message).not.toContain("torch")
})

test("a venv failure names the piece that failed", () => {
  expect(provisionFailureMessage(failure("yue2", "venv_failed"))).toContain("song generator")
  expect(provisionFailureMessage(failure("sheetsage2", "venv_failed"))).toContain(
    "reference transcription",
  )
  expect(provisionFailureMessage(failure("lyricalign", "venv_failed"))).toContain("lyric timing")
})

test("an old driver message says what to install, with both versions", () => {
  const message = provisionFailureMessage({
    ...failure("gpu", "gpu_driver_too_old"),
    detail: "driver 470.82 is older than the required 525.60.13",
    foundDriverVersion: "470.82",
    minimumDriverVersion: "525.60.13",
  })

  expect(message).toContain("470.82")
  expect(message).toContain("525.60.13")
  expect(message.toLowerCase()).toContain("install")
  expect(message.toLowerCase()).toContain("driver")
})

test("a missing GPU message says what to install", () => {
  const message = provisionFailureMessage(failure("gpu", "gpu_missing"))

  expect(message.toLowerCase()).toContain("nvidia")
  expect(message.toLowerCase()).toContain("install")
})
