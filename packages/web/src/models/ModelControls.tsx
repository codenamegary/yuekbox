import * as React from "react"
import { cn } from "@/lib/cn"

export type StateDotProps = Readonly<{
  state: "ready" | "missing"
  className?: string
}>

/** A state lamp: lit when the model is on disk, dark when it is missing. */
export const StateDot: React.FC<StateDotProps> = ({ state, className }) => (
  <span
    aria-hidden
    className={cn(
      "mt-1.5 inline-block size-3 shrink-0 rounded-full",
      state === "ready" ? "bg-orange ring-3 ring-orange/20" : "border-2 border-edge bg-ink",
      className,
    )}
  />
)

export type DownloadBarProps = Readonly<{
  value: number
  className?: string
}>

export const DownloadBar: React.FC<DownloadBarProps> = ({ value, className }) => (
  <div
    className={cn("h-2 w-full overflow-hidden rounded-full bg-ink inset-shadow-well", className)}
  >
    <div
      className="h-full rounded-full bg-orange transition-[width] duration-200 motion-reduce:transition-none"
      style={{ width: `${Math.round(value)}%` }}
    />
  </div>
)

export type ActionButtonProps = React.ComponentProps<"button"> & {
  tone?: "primary" | "secondary" | "ghost"
}

/** A model row's action button. */
export const ActionButton: React.FC<ActionButtonProps> = ({
  tone = "secondary",
  className,
  type = "button",
  ...props
}) => (
  <button
    type={type}
    className={cn(
      "rounded-lg border px-3 py-1.5 text-base font-semibold whitespace-nowrap transition-colors disabled:opacity-40",
      tone === "primary" && "border-orange-soft bg-orange text-paper-ink hover:bg-orange-soft",
      tone === "secondary" && "border-edge bg-panel-raised text-snow hover:border-orange/60",
      tone === "ghost" && "border-transparent text-dim hover:text-snow",
      className,
    )}
    {...props}
  />
)
