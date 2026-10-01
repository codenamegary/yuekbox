import * as React from "react"
import { cn } from "@/lib/cn"

type WordmarkProps = Readonly<{
  className?: string
}>

export const Wordmark: React.FC<WordmarkProps> = ({ className }) => (
  <span
    className={cn(
      "text-stage font-display font-black tracking-tight font-stretch-expanded",
      className,
    )}
  >
    <span className="text-snow">yuek</span>
    <span className="text-orange">box</span>
  </span>
)
