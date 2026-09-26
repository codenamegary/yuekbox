import * as React from "react"
import { cn } from "@/lib/cn"

/** A state dot: lit when the model is on disk, hollow when it is missing. */
export const StateDot: React.FC<{ state: "ready" | "missing"; className?: string }> = ({
  state,
  className,
}) => (
  <span
    aria-hidden
    className={cn(
      "mt-1.5 inline-block size-2 shrink-0 rounded-full",
      state === "ready"
        ? "bg-cyan-400 shadow-[0_0_8px_rgba(0,240,255,0.7)]"
        : "border border-white/25 bg-transparent",
      className,
    )}
  />
)

export const DownloadBar: React.FC<{ value: number; className?: string }> = ({
  value,
  className,
}) => (
  <div className={cn("h-1 w-full overflow-hidden rounded-full bg-white/10", className)}>
    <div
      className="h-full rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(0,240,255,0.6)] transition-[width] duration-200 motion-reduce:transition-none"
      style={{ width: `${Math.round(value)}%` }}
    />
  </div>
)

/** The row's small action, in the settings panel's mono micro-label voice. */
export const ActionButton: React.FC<
  React.ComponentProps<"button"> & { tone?: "primary" | "secondary" | "ghost" }
> = ({ tone = "secondary", className, type = "button", ...props }) => (
  <button
    type={type}
    className={cn(
      "rounded-md border px-2.5 py-1.5 font-mono text-3xs uppercase tracking-[0.15em] transition-colors disabled:opacity-40",
      tone === "primary" && "border-cyan-400/60 bg-cyan-400/15 text-cyan-50 hover:bg-cyan-400/25",
      tone === "secondary" &&
        "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/30 hover:text-white",
      tone === "ghost" && "border-transparent text-white/35 hover:text-white",
      className,
    )}
    {...props}
  />
)
