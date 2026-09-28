import { CommanderError, Command, Option } from "commander"
import { resolve } from "node:path"
import { ModelPathOverrides } from "contracts/http/config"
import { LifecycleCommand } from "./lifecycle.models"

/**
 * One parsed invocation. The four boot fields have the same shape as the
 * server's `parseCliArgs` output, so both parsers feed `startServer` the same
 * way and can never disagree about a command line.
 */
export type ParsedInvocation = Readonly<{
  command: LifecycleCommand
  /** `--home`, anchored to the shell cwd; null means the default home. */
  home: string | null
  /** `--config`, anchored to the shell cwd; null means `<home>/config.yaml`. */
  configPath: string | null
  /** The five model flags, anchored to the shell cwd. */
  models: ModelPathOverrides
  /** `--provision`: build the runtime into the home, then exit. */
  provision: boolean
  /** `status --json`: machine-readable status output. */
  json: boolean
  /** `uninstall --purge`: remove everything without prompts. */
  purge: boolean
  /** Hidden option the detached child is re-exec'd with. Never in help. */
  daemonChild: boolean
}>

export type ParseResult =
  | Readonly<{ kind: "invocation"; invocation: ParsedInvocation }>
  | Readonly<{ kind: "help"; text: string }>
  | Readonly<{ kind: "version"; text: string }>
  | Readonly<{ kind: "error"; message: string; exitCode: number }>

/** commander camelCases `--yue2-model` to `yue2Model`, and so on. */
const modelOptions: Readonly<Record<string, keyof ModelPathOverrides>> = {
  yue2Model: "yue2",
  yue2Vae: "yue2Vae",
  sheetsage2: "sheetsage2",
  sheetsage2Base: "sheetsage2Base",
  whisper: "whisper",
}

type OptionBag = Readonly<Record<string, unknown>>

/**
 * A flag's relative value means the folder the shell was in when yuekbox
 * started, so it is made absolute here, once, at parse time — the same rule
 * the server's parseCliArgs applies.
 */
const readPath = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? resolve(value) : null

const readInvocation = (opts: OptionBag, command: LifecycleCommand): ParsedInvocation => {
  const models: ModelPathOverrides = {}
  for (const [option, key] of Object.entries(modelOptions)) {
    const value = opts[option]
    if (typeof value === "string" && value.trim() !== "") models[key] = resolve(value)
  }
  return {
    command,
    home: readPath(opts.home),
    configPath: readPath(opts.config),
    models,
    provision: opts.provision === true,
    json: opts.json === true,
    purge: opts.purge === true,
    daemonChild: opts.daemonChild === true,
  }
}

/** The flags every command accepts, before or after the command word. */
const sharedOptions = (command: Command): Command =>
  command
    .option("--home <path>", "yuekbox home folder (default ~/.yuekbox)")
    .option("--config <path>", "config.yaml path (default <home>/config.yaml)")
    .option("--yue2-model <path>", "YuE2-3B model directory")
    .option("--yue2-vae <path>", "YuE2-Vae model directory")
    .option("--sheetsage2 <path>", "SheetSage2 model directory")
    .option("--sheetsage2-base <path>", "MERT-v2-FullSong model directory")
    .option("--whisper <path>", "whisper-large-v3-turbo model directory")
    .option("--provision", "build the Python runtime into the home, then exit")

/**
 * Parses one yuekbox command line. Bare `yuekbox` means `start`; anything the
 * parser does not recognize comes back as an error result instead of exiting,
 * so main owns the process: it prints, then exits with the code.
 */
export const parseInvocation = async (
  argv: readonly string[],
  versionString: string,
): Promise<ParseResult> => {
  const found: { invocation?: ParsedInvocation } = {}
  const help: { lines: string[] } = { lines: [] }

  const program = new Command()
  program
    .name("yuekbox")
    .description("A local music box: generate songs on your own GPU.")
    .version(versionString)
    .configureOutput({
      writeOut: (text) => help.lines.push(text),
      writeErr: () => undefined,
    })
    // Help, version, and errors come back as values instead of exiting the
    // process, so the caller owns output and exit codes.
    .exitOverride((error) => {
      throw error
    })
    .addOption(new Option("--daemon-child", "internal daemon entrypoint").hideHelp())
  sharedOptions(program).action(() => {
    // Bare invocation. commander itself fails loud on an unrecognized
    // positional ("too many arguments"), so anything reaching here is bare.
    found.invocation = readInvocation(program.opts(), "start")
  })

  sharedOptions(
    program.command("start").description("start yuekbox in the background (the default)"),
  ).action((options: OptionBag) => {
    found.invocation = readInvocation({ ...program.opts(), ...options }, "start")
  })

  sharedOptions(program.command("stop").description("stop a running yuekbox")).action(
    (options: OptionBag) => {
      found.invocation = readInvocation({ ...program.opts(), ...options }, "stop")
    },
  )

  sharedOptions(
    program
      .command("status")
      .description("show whether yuekbox is running")
      .option("--json", "print machine-readable JSON"),
  ).action((options: OptionBag) => {
    found.invocation = readInvocation({ ...program.opts(), ...options }, "status")
  })

  sharedOptions(
    program
      .command("uninstall")
      .description("stop yuekbox and remove the binary, its data, or both")
      .option("--purge", "remove the binary and the whole home without prompts"),
  ).action((options: OptionBag) => {
    found.invocation = readInvocation({ ...program.opts(), ...options }, "uninstall")
  })

  try {
    program.parse([...argv], { from: "user" })
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.help") {
        return { kind: "help", text: help.lines.join("") }
      }
      if (error.code === "commander.version") {
        return { kind: "version", text: versionString }
      }
      // Some commander errors carry their own "error: " prefix; main adds one.
      const message = error.message.replace(/^error: /, "")
      return { kind: "error", message, exitCode: error.exitCode }
    }
    throw error
  }
  const invocation = found.invocation
  if (invocation === undefined) return { kind: "help", text: help.lines.join("") }
  return { kind: "invocation", invocation }
}
