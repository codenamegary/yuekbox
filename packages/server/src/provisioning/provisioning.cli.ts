import { provisionFailureMessage } from "./provisioning.messages"
import { ProvisionProgress } from "./provisioning.models"
import { ProvisionAll } from "./provisioning.ports"

export type ProvisioningCommandDeps = Readonly<{
  home: string
  provisionAll: ProvisionAll
  log: (line: string) => void
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

const unexpectedFailureMessage =
  "yuekbox could not finish setting up. Check your internet connection, then try again."

/**
 * The `--provision` command. Streams one plain-English line per piece, and on
 * a stop prints the mapped message and a retry hint before exiting nonzero —
 * never a raw error.
 */
export const runProvisioningCommand = async (deps: ProvisioningCommandDeps): Promise<number> => {
  deps.log("Setting up yuekbox for this machine.")

  let result: Awaited<ReturnType<ProvisionAll>>
  try {
    result = await deps.provisionAll({
      home: deps.home,
      onProgress: (event) => deps.log(progressLine(event)),
    })
  } catch {
    deps.log("")
    deps.log(unexpectedFailureMessage)
    deps.log("Run yuekbox again to retry.")
    return 1
  }

  if (!result.ok) {
    deps.log("")
    deps.log(provisionFailureMessage(result.error))
    deps.log("Run yuekbox again to retry.")
    return 1
  }

  deps.log("")
  deps.log("yuekbox is ready.")
  return 0
}
