import * as React from "react"
import { SystemReadiness } from "contracts/http/readiness"
import { systemIssues } from "./models.view"

/** One informational line. Never a config row, never a runtime name. */
export const SystemLine: React.FC<{ system: SystemReadiness | undefined }> = ({ system }) => {
  const issues = systemIssues(system)
  if (system === undefined) return null

  if (issues.length === 0) {
    return <p className="font-mono text-3xs text-white/30">system ready · ffmpeg · NVIDIA driver</p>
  }

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div key={issue.id}>
          <p className="font-mono text-3xs leading-relaxed text-amber-200/80">{issue.message}</p>
          <p className="mt-0.5 font-mono text-3xs text-white/35">
            linux ·{" "}
            <code className="rounded bg-black/50 px-1 py-0.5 text-amber-100">
              {issue.fix.linux}
            </code>
          </p>
          <p className="mt-0.5 font-mono text-3xs text-white/35">
            wsl2 ·{" "}
            <code className="rounded bg-black/50 px-1 py-0.5 text-amber-100">{issue.fix.wsl2}</code>
          </p>
        </div>
      ))}
    </div>
  )
}
