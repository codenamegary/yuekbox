// Throwaway spike entrypoint for issue #51. NOT production code.
//
// Goal: prove one `bun build --compile` executable can boot the real Fastify
// server (server.ts), serve the real SPA (embedded at build time), open
// bun:sqlite through the real db/client.ts, resolve config.yaml from a home
// directory, and install + exec an embedded Python helper under that home.
//
// The side-effect import below runs the real process root: resolveBootEnv,
// openDatabase (drizzle migrations), dependency checks, composeServer, and
// app.listen. It also wires `--provision` to the real provisioning CLI.
import { existsSync, readFileSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import "../../packages/server/src/server.ts"
import { resolveBootEnv } from "../../packages/server/src/config/config.boot"
import { makeLoadModelOverrides } from "../../packages/server/src/config/config.yaml.adapters"
import {
  makeInstallScripts,
  scriptManifest,
  toolsRoot,
} from "../../packages/server/src/provisioning/provisioning.scripts.adapters"
import { homeLayout } from "../../packages/server/src/shared/home"
// Compile-time SPA: `bun build --compile` bundles the HTML entry and every
// asset it references into the executable. Bun.serve serves that manifest.
import index from "../../packages/web/src/index.html"

const apiHost = process.env.HOST ?? "127.0.0.1"
const apiPort = Number(process.env.PORT ?? 8787)
const apiOrigin = `http://${apiHost}:${apiPort}`
const webHost = process.env.WEB_HOST ?? "127.0.0.1"
const webPort = Number(process.env.WEB_PORT ?? 3000)

const boot = await resolveBootEnv({
  argv: Bun.argv,
  env: process.env,
  osHome: homedir(),
  loadModelOverrides: (configFilePath) => makeLoadModelOverrides(configFilePath)(),
})

// Byte-for-byte the proxy in packages/web/src/serve.ts, inlined because the
// spike must not run a second process.
const proxyToApi = async (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const target = new URL(`${url.pathname}${url.search}`, apiOrigin)
  const upstream = await fetch(new Request(target, request))
  const body = await upstream.arrayBuffer()
  const headers = new Headers(upstream.headers)
  headers.delete("content-encoding")
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

const server = Bun.serve({
  hostname: webHost,
  port: webPort,
  routes: {
    "/v1/*": proxyToApi,
    "/*": index,
  },
})

console.log(`[spike] web listening on ${server.url}`)
console.log(`[spike] proxying /v1 to ${apiOrigin}`)

console.log(
  `[spike] runtime ${JSON.stringify(
    {
      bunVersion: Bun.version,
      isStandaloneExecutable: Bun.isStandaloneExecutable,
      importMetaDir: import.meta.dir,
      importMetaUrl: import.meta.url,
      bunMain: Bun.main,
      argv: Bun.argv,
      execPath: process.execPath,
      pythonOnPath: Bun.which("python3"),
      home: boot.home,
      configFilePath: boot.configFilePath,
      modelPaths: boot.modelPaths,
      embeddedFiles: Bun.embeddedFiles.map((blob) => blob.name),
    },
    null,
    2,
  )}`,
)

// ---- embedded Python helper: extract under the home, then exec ----
// The production `toolsRoot` (fileURLToPath(new URL("../../tools/", import.meta.url)))
// is the #50 path that breaks in a compiled binary. The fix shape for #52 is
// the embedded root below: --asset the tools tree and read it from
// import.meta.dir, which resolves to /$bunfs/root in a compiled executable.
const embeddedToolsRoot = join(import.meta.dir, "tools")
console.log(
  `[spike] toolsRoot=${toolsRoot} (exists=${existsSync(toolsRoot)}) ` +
    `embeddedToolsRoot=${embeddedToolsRoot} (exists=${existsSync(embeddedToolsRoot)})`,
)

const layout = homeLayout(boot.home)
const installed = await makeInstallScripts(embeddedToolsRoot)(layout.scripts)

// Finding: node:fs/promises copyFile cannot read a /$bunfs source, so the real
// installer fails against embedded tools. #52 has to read bytes and write
// them, or extract at boot. The fallback below is the spike's proof that the
// read+write shape works.
const installFiles = async (): Promise<readonly string[]> => {
  if (installed.ok) return installed.value.files
  console.warn(`[spike] makeInstallScripts failed on embedded source: ${installed.error.detail}`)
  console.warn("[spike] falling back to Bun.file bytes + Bun.write")
  await mkdir(layout.scripts, { recursive: true })
  const names: string[] = []
  for (const entry of scriptManifest) {
    const bytes = await Bun.file(join(embeddedToolsRoot, entry.source)).bytes()
    await Bun.write(join(layout.scripts, entry.name), bytes)
    names.push(entry.name)
  }
  return names
}

const installedFiles = await installFiles()
const identical = scriptManifest.every((entry) =>
  readFileSync(join(embeddedToolsRoot, entry.source)).equals(
    readFileSync(join(layout.scripts, entry.name)),
  ),
)
console.log(
  `[spike] installed ${installedFiles.length} embedded scripts to ${layout.scripts} ` +
    `(byte-identical=${identical}): ${installedFiles.join(", ")}`,
)

const python = Bun.spawnSync({
  cmd: ["python3", join(layout.scripts, "generate.py"), "--help"],
  cwd: boot.home,
  stdout: "pipe",
  stderr: "pipe",
})
console.log(
  `[spike] exec python3 ${join(layout.scripts, "generate.py")} --help -> exit=${python.exitCode}`,
)
console.log(`[spike] ${python.stdout.toString().split("\n")[0] ?? ""}`)

if (process.env.SPIKE_SELF_TEST === "1") {
  const base = `http://${webHost}:${webPort}`
  const [statusResponse, configResponse, uiResponse] = await Promise.all([
    fetch(`${base}/v1/status`),
    fetch(`${base}/v1/config`),
    fetch(`${base}/`),
  ])
  const status = await statusResponse.json()
  const config = await configResponse.json()
  const ui = await uiResponse.text()
  console.log(
    `[spike] self-test ${JSON.stringify(
      {
        statusCode: statusResponse.status,
        status,
        configCode: configResponse.status,
        config,
        uiCode: uiResponse.status,
        uiBytes: ui.length,
        uiHasRoot: ui.includes('id="root"'),
        uiHasModuleScript: ui.includes("<script"),
      },
      null,
      2,
    )}`,
  )
  const ok =
    statusResponse.status === 200 &&
    configResponse.status === 200 &&
    uiResponse.status === 200 &&
    ui.includes('id="root"')
  process.exit(ok ? 0 : 1)
}
