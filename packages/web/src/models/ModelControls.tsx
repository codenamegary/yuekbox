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
      state === "ready"
        ? "bg-amber shadow-[0_0_0_3px_rgba(242,169,59,0.2)]"
        : "border-2 border-cabinet-edge bg-cabinet-sunken",
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
    className={cn(
      "h-2 w-full overflow-hidden rounded-full bg-cabinet-sunken shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]",
      className,
    )}
  >
    <div
      className="h-full rounded-full bg-amber transition-[width] duration-200 motion-reduce:transition-none"
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
      tone === "primary" && "border-amber-soft bg-amber text-strip-ink hover:bg-amber-soft",
      tone === "secondary" &&
        "border-cabinet-edge bg-cabinet-raised text-ivory hover:border-amber/60",
      tone === "ghost" && "border-transparent text-dim hover:text-ivory",
      className,
    )}
    {...props}
  />
)
