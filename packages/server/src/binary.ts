// The compiled binary's process root (#52). One pid serves the SPA from the
// build-time HTML bundle on WEB_PORT and answers /v1 by proxying loopback to
// the Fastify listener inside the same process.
//
// Fastify binds 127.0.0.1:0, so the API port is ephemeral and can never
// collide with the public one. `bun run dev` keeps the two-process shape
// (packages/web/src/serve.ts on :3000 proxying packages/server/src/server.ts
// on :8787); only the compiled executable start here.
//
// Build: `bun run build:binary` -> scripts/build-binary.ts.
import { homedir } from "node:os"
// Build-time SPA: the compiler bundles the HTML entry and every asset it
// references (Tailwind CSS included) into the executable.
import index from "../../web/src/index.html"
import { makeApiProxy } from "contracts/http/proxy"
import { BootEnv } from "./config/config.boot"
import { makeInstallScripts, toolsRoot } from "./provisioning/provisioning.scripts.adapters"
import { startServer } from "./server"
import { homeLayout } from "./shared/home"

const webHost = process.env.WEB_HOST ?? "127.0.0.1"
const webPort = Number(process.env.WEB_PORT ?? 3000)

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

const api = await startServer({
  argv: Bun.argv,
  env: process.env,
  osHome: homedir(),
  standalone: true,
  ensureScripts,
})

// One proxy hop to the API, shared with packages/web/src/serve.ts so
// streaming and error responses behave the same in dev and in the binary.
const proxyToApi = makeApiProxy(`http://${api.host}:${api.port}`)

const web = Bun.serve({
  hostname: webHost,
  port: webPort,
  routes: {
    "/v1/*": proxyToApi,
    "/*": index,
  },
})

console.log(`yuekbox listening on ${web.url.href}`)

const shutdown = async (signal: string): Promise<void> => {
  console.log(`received ${signal}; shutting down`)
  await web.stop(true)
  await api.close()
  process.exit(0)
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM")
})
process.on("SIGINT", () => {
  void shutdown("SIGINT")
})
