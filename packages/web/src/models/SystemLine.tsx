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
    return <p className="font-mono text-3xs text-white/30">system ready · ffmpeg · GPU</p>
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div key={issue.id}>
          <p className="font-mono text-3xs leading-relaxed text-amber-200/80">{issue.message}</p>
          {fixPlatforms.map(({ key, label }) => {
            const line = issue.fix[key]
            if (line === undefined) return null
            return (
              <p key={key} className="mt-0.5 font-mono text-3xs text-white/35">
                {label} ·{" "}
                <code className="rounded bg-black/50 px-1 py-0.5 text-amber-100">{line}</code>
              </p>
            )
          })}
        </div>
      ))}
    </div>
  )
}
