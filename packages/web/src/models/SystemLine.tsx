import * as React from "react"
import { SystemReadiness } from "contracts/http/readiness"
import { systemIssues } from "./models.view"

const fixPlatforms: readonly { key: "linux" | "wsl2" | "macos"; label: string }[] = [
  { key: "linux", label: "linux" },
  { key: "wsl2", label: "wsl2" },
  { key: "macos", label: "macos" },
]

export type SystemLineProps = Readonly<{
  system: SystemReadiness | undefined
}>

/** One informational line. Never a config row, never a runtime name. */
export const SystemLine: React.FC<SystemLineProps> = ({ system }) => {
  const issues = systemIssues(system)
  if (system === undefined) return null

  if (issues.length === 0) {
    return <p className="text-sm text-dim">System ready · ffmpeg · GPU</p>
  }

  return (
    <div className="space-y-3">
      {issues.map((issue) => (
        <div key={issue.id}>
          <p className="text-base text-amber">{issue.message}</p>
          {fixPlatforms.map(({ key, label }) => {
            const line = issue.fix[key]
            if (line === undefined) return null
            return (
              <p key={key} className="mt-1 text-sm text-dim">
                {label} ·{" "}
                <code className="rounded bg-cabinet-sunken px-1.5 py-0.5 font-mono text-amber-soft">
                  {line}
                </code>
              </p>
            )
          })}
        </div>
      ))}
    </div>
  )
}
