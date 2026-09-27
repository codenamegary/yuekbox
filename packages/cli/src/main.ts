// The yuekbox process root (#78). One binary, four lifecycle commands, and a
// detached daemon child that serves the SPA from the build-time HTML bundle on
// WEB_PORT and answers /v1 by proxying loopback to the Fastify listener in the
// same process. The exclusive flock on <home>/run/yuekbox.lock decides whether
// yuekbox is running; <home>/run/yuekbox.json carries the pid, URL, and log.
//
// Fastify binds 127.0.0.1:0, so the API port is ephemeral and can never
// collide with the public one. `bun run dev` keeps the two-process shape
// (packages/web/src/serve.ts on :3000 proxying packages/server/src/server.ts
// on :8787); only the compiled executable runs the daemon from here.
//
// Build: `bun run build:binary` -> scripts/build-binary.ts.
import { homedir } from "node:os"
// Build-time SPA: the compiler bundles the HTML entry and every asset it
// references (Tailwind CSS included) into the executable.
import index from "../../web/src/index.html"
import chalk from "chalk"
import { makeApiProxy } from "contracts/http/proxy"
import {
  acquireLock,
  listEntries,
  now,
  out,
  probeLock,
  probeService,
  promptYesNo,
  readLogTail,
  readRunState,
  releaseLock,
  removePath,
  signalPid,
  sleep,
  spawnDetached,
  stdinIsTty,
  writeRunState,
} from "./lifecycle/lifecycle.adapters"
import { logRotateBytes } from "./lifecycle/lifecycle.models"
import { parseInvocation, ParsedInvocation } from "./lifecycle/lifecycle.parse"
import { logFilePath, runLockPath, runStatePath } from "./lifecycle/lifecycle.paths"
import { makeStart } from "./lifecycle/lifecycle.start.usecase"
import { makeStatus } from "./lifecycle/lifecycle.status.usecase"
import { makeStop, StopInput } from "./lifecycle/lifecycle.stop.usecase"
import { makeUninstall } from "./lifecycle/lifecycle.uninstall.usecase"
import { makeRotateLog } from "./lifecycle/lifecycle.adapters"
import {
  makeInstallScripts,
  toolsRoot,
} from "server/src/provisioning/provisioning.scripts.adapters"
import { startServer } from "server/src/server"
import { BootEnv } from "server/src/config/config.boot"
import { defaultHome, homeLayout } from "server/src/shared/home"
import { version } from "server/src/version"

/**
 * Extracts the embedded Python helpers into `<home>/scripts` before the
 * dependency checks run. Idempotent and overwrite-only, like provisioning's
 * own installer: a new binary refreshes the helpers it shipped. Full setup
 * (venvs, models) still needs the explicit `--provision`, which exits before
 * this point.
 */
const ensureScripts = async (boot: BootEnv): Promise<void> => {
  const result = await makeInstallScripts(toolsRoot)(homeLayout(boot.home).scripts)
  if (!result.ok) {
    throw new Error(`could not install the bundled Python helpers: ${result.error.detail}`)
  }
  console.log(`installed ${result.value.files.length} Python helpers to ${result.value.scriptsDir}`)
}

/**
 * The detached daemon child: skips the lifecycle dispatch, takes the home
 * lock, installs the Python helpers, boots the API, serves the SPA, and only
 * then writes the state file the parent is waiting for. Never returns: the
 * process ends through a signal, a boot failure, or a shutdown.
 */
const runDaemon = async (invocation: ParsedInvocation): Promise<void> => {
  const home = invocation.home ?? defaultHome(homedir())
  const lock = await acquireLock(runLockPath(home))
  if (lock === null) {
    console.log("yuekbox is already running")
    process.exit(0)
  }
  // A state file from a previous life means nothing now that this process
  // holds the lock; the fresh one overwrites it once both listeners are up.
  await removePath(runStatePath(home))
  const startedAt = new Date().toISOString()
  try {
    const api = await startServer({
      home: invocation.home,
      configPath: invocation.configPath,
      models: invocation.models,
      provision: invocation.provision,
      env: process.env,
      osHome: homedir(),
      standalone: true,
      ensureScripts,
    })

    // One proxy hop to the API, shared with packages/web/src/serve.ts so
    // streaming and error responses behave the same in dev and in the binary.
    const proxyToApi = makeApiProxy(`http://${api.host}:${api.port}`)
    const web = Bun.serve({
      hostname: process.env.WEB_HOST ?? "127.0.0.1",
      port: Number(process.env.WEB_PORT ?? 3000),
      routes: {
        "/v1/*": proxyToApi,
        "/*": index,
      },
    })
    await writeRunState(runStatePath(home), {
      pid: process.pid,
      host: web.url.hostname,
      port: Number(web.url.port === "" ? 80 : web.url.port),
      version,
      startedAt,
      logPath: logFilePath(home),
    })

    console.log(`yuekbox listening on ${web.url.href}`)
    const shutdown = async (signal: string): Promise<void> => {
      console.log(`received ${signal}; shutting down`)
      await web.stop(true)
      await api.close()
      await releaseLock(lock)
      await removePath(runStatePath(home))
      process.exit(0)
    }
    process.on("SIGTERM", () => {
      void shutdown("SIGTERM")
    })
    process.on("SIGINT", () => {
      void shutdown("SIGINT")
    })
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

/** The command the parent re-execs: this process again, as the daemon child. */
const daemonCommand = (tokens: readonly string[]): readonly string[] => [
  process.execPath,
  ...(Bun.isStandaloneExecutable ? [] : [Bun.main]),
  "--daemon-child",
  ...tokens,
]

const stop = makeStop({
  readState: readRunState,
  probeLock,
  signalPid,
  now,
  sleep,
  removePath,
  out,
})

/**
 * The foreground dispatch. Provisioning is the one attached path: it prints
 * progress to the terminal and exits inside startServer, exactly as it always
 * has. Everything else runs the lifecycle use cases and maps to exit codes.
 */
const dispatch = async (invocation: ParsedInvocation, tokens: readonly string[]): Promise<void> => {
  if (invocation.provision) {
    await startServer({
      home: invocation.home,
      configPath: invocation.configPath,
      models: invocation.models,
      provision: true,
      env: process.env,
      osHome: homedir(),
      ensureScripts,
    })
    process.exit(0)
  }

  const home = invocation.home ?? defaultHome(homedir())
  switch (invocation.command) {
    case "start": {
      const exitCode = await makeStart({
        probeLock,
        spawnDetached,
        readState: readRunState,
        readLogTail,
        rotateLog: makeRotateLog(logRotateBytes),
        now,
        sleep,
        out,
      })({
        lockPath: runLockPath(home),
        statePath: runStatePath(home),
        logPath: logFilePath(home),
        cmd: daemonCommand(tokens),
      })
      process.exit(exitCode)
    }
    case "stop": {
      process.exit(
        await stop({
          lockPath: runLockPath(home),
          statePath: runStatePath(home),
        }),
      )
    }
    case "status": {
      process.exit(
        await makeStatus({
          readState: readRunState,
          probeLock,
          probeService,
          now,
          out,
        })({
          home,
          lockPath: runLockPath(home),
          statePath: runStatePath(home),
          json: invocation.json,
        }),
      )
    }
    case "uninstall": {
      process.exit(
        await makeUninstall({
          stdinIsTty,
          prompt: promptYesNo,
          listEntries,
          removePath,
          stop: (input: StopInput) => stop(input),
          out,
        })({
          home,
          lockPath: runLockPath(home),
          statePath: runStatePath(home),
          execPath: process.execPath,
          standalone: Bun.isStandaloneExecutable,
          purge: invocation.purge,
        }),
      )
    }
  }
}

const tokens = Bun.argv.slice(2)
const parsed = await parseInvocation(tokens, version)
if (parsed.kind === "help") {
  process.stdout.write(parsed.text)
  process.exit(0)
}
if (parsed.kind === "version") {
  console.log(chalk.bold(`yuekbox ${parsed.text}`))
  process.exit(0)
}
if (parsed.kind === "error") {
  console.error(chalk.red(`error: ${parsed.message}`))
  process.exit(parsed.exitCode)
}

if (parsed.invocation.daemonChild) await runDaemon(parsed.invocation)
else await dispatch(parsed.invocation, tokens)
