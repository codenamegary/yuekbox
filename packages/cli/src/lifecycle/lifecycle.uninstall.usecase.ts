import chalk from "chalk"
import { dataBuckets, homeBuckets } from "./lifecycle.paths"
import { StopInput } from "./lifecycle.stop.usecase"
import { ListEntries, Out, PromptYesNo, RemovePath, StdinIsTty } from "./lifecycle.ports"

export type UninstallDeps = Readonly<{
  stdinIsTty: StdinIsTty
  prompt: PromptYesNo
  listEntries: ListEntries
  removePath: RemovePath
  /** The bound stop flow: the running instance goes before anything is removed. */
  stop: (input: StopInput) => Promise<number>
  out: Out
}>

export type UninstallInput = Readonly<{
  home: string
  lockPath: string
  statePath: string
  /** The executable that would be removed, `process.execPath` at the root. */
  execPath: string
  /** Only the packaged binary may remove itself; a dev runtime never may. */
  standalone: boolean
  /** `--purge`: remove the binary and the whole home without prompts. */
  purge: boolean
}>

type Answers = Readonly<{
  binary: boolean
  data: boolean
  models: boolean
}>

/**
 * The three questions, in the pinned order, binary first. Binary defaults
 * yes; data and models default no. The models prompt only appears when the
 * models folder has something in it. Null means refused: no TTY.
 */
const askAnswers = async (deps: UninstallDeps, input: UninstallInput): Promise<Answers | null> => {
  if (!deps.stdinIsTty()) {
    deps.out(
      "uninstall needs a terminal to ask what to remove; rerun with --purge to skip the prompts",
    )
    return null
  }
  const binary =
    input.standalone &&
    (await deps.prompt(`Remove the yuekbox executable at ${input.execPath}?`, true))
  const data = await deps.prompt(
    `Remove app data at ${input.home} (config, runtime, scripts, songs, database)?`,
    false,
  )
  const modelsPath = homeBuckets(input.home).models
  const models =
    (await deps.listEntries(modelsPath)).length > 0 &&
    (await deps.prompt(`Remove downloaded models at ${modelsPath}?`, false))
  return { binary: binary === true, data, models: models === true }
}

/**
 * Answers first, then the running instance is stopped, then deletion runs,
 * then one summary. The executable is removed last: everything else is
 * rebuildable, the binary is the thing being uninstalled. External model
 * paths from config.yaml are never touched — only what lives under the home.
 * Returns 0, or 1 when refused or a deletion failed.
 */
export const makeUninstall =
  (deps: UninstallDeps) =>
  async (input: UninstallInput): Promise<number> => {
    const answers = input.purge
      ? { binary: input.standalone, data: true, models: true }
      : await askAnswers(deps, input)
    if (answers === null) return 1
    if (answers.binary === false && answers.data === false && answers.models === false) {
      deps.out("nothing removed")
      return 0
    }

    await deps.stop({ lockPath: input.lockPath, statePath: input.statePath })

    const removed: string[] = []
    const failures: string[] = []
    const remove = async (path: string): Promise<void> => {
      try {
        await deps.removePath(path)
        removed.push(path)
      } catch {
        failures.push(path)
      }
    }

    const buckets = homeBuckets(input.home)
    const wholeHome = input.purge || (answers.data && answers.models)
    if (wholeHome) {
      await remove(input.home)
    } else if (answers.data) {
      // App data without models: every bucket except the model folders.
      for (const bucket of dataBuckets(input.home)) await remove(bucket)
    } else if (answers.models) {
      await remove(buckets.models)
    }
    if (answers.binary) await remove(input.execPath)

    for (const path of removed) deps.out(`removed ${path}`)
    for (const path of failures) deps.out(chalk.red(`could not remove ${path}`))
    return failures.length === 0 ? 0 : 1
  }
