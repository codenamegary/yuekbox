import { ModelPathOverrides } from "contracts/http/config"

export type CliArgs = Readonly<{
  /** `--home`; null means `~/.yuekbox`. */
  home: string | null
  /** `--config`; null means `<home>/config.yaml`. */
  configPath: string | null
  /** CLI model overrides, the highest precedence. */
  models: ModelPathOverrides
  /** `--provision`: build the runtime into the home, then exit. */
  provision: boolean
}>

const modelFlags: Readonly<Record<string, keyof ModelPathOverrides>> = {
  "--yue2-model": "yue2",
  "--yue2-vae": "yue2Vae",
  "--sheetsage2": "sheetsage2",
  "--sheetsage2-base": "sheetsage2Base",
  "--whisper": "whisper",
}

/** The command line flag that pins one model's path, when there is one. */
export const flagForModel = (key: keyof ModelPathOverrides): string | null =>
  Object.entries(modelFlags).find(([, model]) => model === key)?.[0] ?? null

type Flags = Readonly<{
  /** Every `--flag value` pair the command line carried. */
  flags: Readonly<Record<string, string>>
  /** Whether `--provision` appeared anywhere in the tokens. */
  provision: boolean
}>

const isKnownFlag = (flag: string): boolean =>
  flag === "--home" || flag === "--config" || modelFlags[flag] !== undefined

const readFlags = (argv: readonly string[]): Flags => {
  const [token, ...rest] = argv
  if (token === undefined || token === "--") return { flags: {}, provision: false }
  if (!token.startsWith("--")) return readFlags(rest)
  if (token === "--provision") {
    const tail = readFlags(rest)
    return { flags: tail.flags, provision: true }
  }
  if (!isKnownFlag(token.split("=")[0] ?? token)) throw new Error(`unknown flag: ${token}`)

  const equals = token.indexOf("=")
  const flag = equals === -1 ? token : token.slice(0, equals)
  const inline = equals === -1 ? null : token.slice(equals + 1)
  const value = inline ?? rest[0]
  if (value === undefined || value.trim() === "" || (inline === null && value.startsWith("--"))) {
    throw new Error(`${flag} needs a value`)
  }
  const tail = readFlags(inline === null ? rest.slice(1) : rest)
  // Later flags win, so the tail spreads over the value read here.
  return { flags: { [flag]: value, ...tail.flags }, provision: tail.provision }
}

/** Reads the yuekbox flags out of Bun.argv. Bun's argv shape (bun, script, ...) is ignored. */
export const parseCliArgs = (argv: readonly string[]): CliArgs => {
  const { flags, provision } = readFlags(argv)

  const models: ModelPathOverrides = {}
  for (const [flag, key] of Object.entries(modelFlags)) {
    const value = flags[flag]
    if (value !== undefined) models[key] = value
  }

  return {
    home: flags["--home"] ?? null,
    configPath: flags["--config"] ?? null,
    models,
    provision,
  }
}
