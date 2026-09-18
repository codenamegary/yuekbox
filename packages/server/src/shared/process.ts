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
) => Promise<ProcessOutcome>

export const runProcess: ProcessRunner = async (command, cwd, onStderrLine) => {
  const proc = Bun.spawn([...command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })

  const decoder = new TextDecoder()
  let tail = ""
  let pending = ""

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
