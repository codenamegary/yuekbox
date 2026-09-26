import { ModelPathOverrides } from "contracts/http/config"

export type CliArgs = Readonly<{
  /** `--home`; null means `~/.yuekbox`. */
  home: string | null
  /** `--config`; null means `<home>/config.yaml`. */
  configPath: string | null
  /** CLI model overrides, the highest precedence. */
  models: ModelPathOverrides
}>

const modelFlags: Readonly<Record<string, keyof ModelPathOverrides>> = {
  "--yue2-model": "yue2",
  "--yue2-vae": "yue2Vae",
  "--sheetsage2": "sheetsage2",
  "--sheetsage2-base": "sheetsage2Base",
  "--whisper": "whisper",
}

const readValue = (flag: string, inline: string | null, next: string | undefined): string => {
  if (inline !== null) {
    if (inline.trim() === "") throw new Error(`${flag} needs a value`)
    return inline
  }
  if (next === undefined || next.startsWith("--") || next.trim() === "") {
    throw new Error(`${flag} needs a value`)
  }
  return next
}

/** Reads the yuekbox flags out of Bun.argv. Bun's argv shape (bun, script, ...) is ignored. */
export const parseCliArgs = (argv: readonly string[]): CliArgs => {
  let home: string | null = null
  let configPath: string | null = null
  const models: ModelPathOverrides = {}
  let index = 0

  while (index < argv.length) {
    const token = argv[index] ?? ""
    index += 1

    if (token === "--") break
    if (!token.startsWith("--")) continue

    const equals = token.indexOf("=")
    const flag = equals === -1 ? token : token.slice(0, equals)
    const inline = equals === -1 ? null : token.slice(equals + 1)
    const model = modelFlags[flag]

    if (flag === "--home" || flag === "--config" || model !== undefined) {
      const value = readValue(flag, inline, argv[index])
      if (inline === null) index += 1

      if (flag === "--home") home = value
      else if (flag === "--config") configPath = value
      else if (model !== undefined) models[model] = value
      continue
    }

    throw new Error(`unknown flag: ${flag}`)
  }

  return { home, configPath, models }
}
