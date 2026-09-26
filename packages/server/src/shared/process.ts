export type ProcessOutcome = Readonly<{
  exitCode: number
  stdout: string
  stderrTail: string
}>

const stderrTailLimit = 4000

export type ProcessRunner = (
  command: readonly string[],
  cwd: string,
  onStderrLine: (line: string) => void,
  /**
   * The child environment. When given, it replaces the parent environment
   * entirely, so a child that must not inherit configuration (uv, for one)
   * gets exactly what the caller passes. When omitted, the child inherits.
   */
  env?: Readonly<Record<string, string>>,
) => Promise<ProcessOutcome>

/**
 * The parent environment minus every key starting with one of the denied
 * prefixes. Use it as the base for a child environment that must not
 * inherit the parent's configuration for one tool.
 */
export const envWithout = (
  deniedPrefixes: readonly string[],
  parent: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(parent).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !deniedPrefixes.some((prefix) => entry[0].startsWith(prefix)),
    ),
  )

export const runProcess: ProcessRunner = async (command, cwd, onStderrLine, env) => {
  const proc = Bun.spawn([...command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    ...(env === undefined ? {} : { env }),
  })

  const decoder = new TextDecoder()
  let tail = "" // structure: allow-let
  let pending = "" // structure: allow-let

  const consumeStderr = (async () => {
    for await (const chunk of proc.stderr) {
      const text = decoder.decode(chunk, { stream: true })
      tail = (tail + text).slice(-stderrTailLimit)
      pending += text
      const lines = pending.split("\n")
      pending = lines.pop() ?? ""
      for (const line of lines) onStderrLine(line)
    }
    if (pending.length > 0) onStderrLine(pending)
  })()

  const stdoutPromise = new Response(proc.stdout).text()
  const [stdout] = await Promise.all([stdoutPromise, consumeStderr])
  const exitCode = await proc.exited

  return { exitCode, stdout, stderrTail: tail }
}
