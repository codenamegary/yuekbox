import { provisionFailureMessage } from "./provisioning.messages"
import { ProvisionProgress } from "./provisioning.models"
import { ProvisionAll } from "./provisioning.ports"

export type ProvisioningCommandDeps = Readonly<{
  home: string
  provisionAll: ProvisionAll
  log: (line: string) => void
  /** The diagnostic stream; the process root leaves it at console.error. */
  logDetail?: (line: string) => void
}>

const progressLine = (event: ProvisionProgress): string => {
  switch (event.status) {
    case "started":
      return `  ${event.label}...`
    case "completed":
      return `  done  ${event.label}`
    case "skipped":
      return `  done  ${event.label} (already done)`
    case "failed":
      return `  failed  ${event.label}`
  }
}

const retryHint = "Run yuekbox --provision to retry."

const unexpectedFailureMessage =
  "yuekbox could not finish setting up. Check your internet connection, then try again."

/** Runs provisioning; a thrown setup maps to null for the catch-all message. */
const provisionOrFail = async (
  deps: ProvisioningCommandDeps,
): Promise<Awaited<ReturnType<ProvisionAll>> | null> => {
  try {
    return await deps.provisionAll({
      home: deps.home,
      onProgress: (event) => deps.log(progressLine(event)),
    })
  } catch {
    return null
  }
}

/**
 * The `--provision` command. Streams one plain-English line per piece, and on
 * a stop prints the mapped message on stdout with the raw detail on stderr,
 * then a retry hint, then exits nonzero.
 */
export const runProvisioningCommand = async (deps: ProvisioningCommandDeps): Promise<number> => {
  const logDetail = deps.logDetail ?? ((line: string) => console.error(line))
  deps.log("Setting up yuekbox for this machine.")

  const result = await provisionOrFail(deps)
  if (result === null) {
    deps.log("")
    deps.log(unexpectedFailureMessage)
    deps.log(retryHint)
    return 1
  }

  if (!result.ok) {
    deps.log("")
    deps.log(provisionFailureMessage(result.error))
    logDetail(result.error.detail)
    deps.log(retryHint)
    return 1
  }

  deps.log("")
  deps.log("yuekbox is ready.")
  return 0
}
