import * as React from "react"
import { cn } from "@/lib/cn"

type PresetIconName =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "groq"
  | "mistral"
  | "deepseek"
  | "together"
  | "ollama"
  | "lmstudio"
  | "custom"

type AiPresetIconProps = Readonly<{
  name: string
  className?: string
}>

const sunburst = (
  <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none">
    <path d="M8 1.6 V14.4" />
    <path d="M1.6 8 H14.4" />
    <path d="M3.5 3.5 L12.5 12.5" />
    <path d="M12.5 3.5 L3.5 12.5" />
  </g>
)

const sparkle = (
  <path
    d="M8 1.2 C8.6 4.6 11.4 7.4 14.8 8 C11.4 8.6 8.6 11.4 8 14.8 C7.4 11.4 4.6 8.6 1.2 8 C4.6 7.4 7.4 4.6 8 1.2 Z"
    fill="currentColor"
  />
)

const knot = (
  <g stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round">
    <path d="M8 1.4 L13.9 4.7 L13.9 11.3 L8 14.6 L2.1 11.3 L2.1 4.7 Z" />
    <path d="M8 4.6 L11.2 6.4 L11.2 9.6 L8 11.4 L4.8 9.6 L4.8 6.4 Z" />
  </g>
)

const swap = (
  <g
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    fill="none"
  >
    <path d="M2.5 5.5 H12 L9.5 3" />
    <path d="M13.5 10.5 H4 L6.5 13" />
  </g>
)

const bolt = <path d="M9 1.5 L3.5 9 H7.2 L6.4 14.5 L12.5 6.6 L8.6 6.6 Z" fill="currentColor" />

const gust = (
  <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none">
    <path d="M2.5 5 H11" />
    <path d="M4.5 8 H13.5" />
    <path d="M2.5 11 H9.5" />
  </g>
)

const wave = (
  <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none">
    <path d="M1.5 6.5 C3.5 3.5 5.5 3.5 7.5 6.5 C9.5 9.5 11.5 9.5 13.5 6.5" />
    <path d="M1.5 11 C3.5 8 5.5 8 7.5 11 C9.5 14 11.5 14 13.5 11" opacity="0.55" />
  </g>
)

const twin = (
  <g stroke="currentColor" strokeWidth="1.4" fill="none">
    <circle cx="5.6" cy="8" r="3.9" />
    <circle cx="10.4" cy="8" r="3.9" />
  </g>
)

const llama = (
  <g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
    <circle cx="8" cy="9.4" r="4.9" />
    <circle cx="4.4" cy="3.4" r="1.5" />
    <circle cx="11.6" cy="3.4" r="1.5" />
  </g>
)

const framed = (
  <g stroke="currentColor" strokeWidth="1.4" fill="none">
    <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.5" />
    <circle cx="8" cy="8" r="1.7" fill="currentColor" stroke="none" />
  </g>
)

const sliders = (
  <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none">
    <path d="M3.5 2.5 V6.5 M3.5 9.5 V13.5" />
    <circle cx="3.5" cy="8" r="1.4" />
    <path d="M8 2.5 V4.5 M8 7.5 V13.5" />
    <circle cx="8" cy="6" r="1.4" />
    <path d="M12.5 2.5 V9.5 M12.5 12.5 V13.5" />
    <circle cx="12.5" cy="11" r="1.4" />
  </g>
)

const icons: Readonly<Record<PresetIconName, React.ReactNode>> = {
  openai: knot,
  anthropic: sunburst,
  gemini: sparkle,
  openrouter: swap,
  groq: bolt,
  mistral: gust,
  deepseek: wave,
  together: twin,
  ollama: llama,
  lmstudio: framed,
  custom: sliders,
}

export const AiPresetIcon: React.FC<AiPresetIconProps> = ({ name, className }) => {
  const key = (name in icons ? name : "custom") as PresetIconName
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("w-4 h-4", className)}
      aria-hidden="true"
      focusable="false"
    >
      {icons[key]}
    </svg>
  )
}
