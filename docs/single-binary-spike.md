# Single-binary spike findings (#51)

Status: spike complete. Prototype lives in `spikes/single-binary/` and is
throwaway. Bun version: **1.4.2** (`packageManager` is `bun@1.4.2`, no
divergence).

The prototype compiles the real `packages/server/src/server.ts` and the real
`packages/web/src/index.html` into one executable. It boots Fastify, opens
`bun:sqlite` through the real `db/client.ts`, serves the SPA, reads a home
`config.yaml`, and extracts plus executes the real
`packages/server/tools/yue2/generate.py` under the home. All acceptance items
pass on the compiled artifact.

## Verdict

`bun build --compile` can carry this app. Only two pieces of existing
production code must change for #52: `toolsRoot` and the `copyFile` in
`makeInstallScripts`. Everything else survives compilation unchanged. The
single-listener shape also needs a new process root, which #52 adds anyway.

## Build command and flags

Use `Bun.build` with `compile`, not the `bun build --compile` CLI, because the
SPA HTML import needs `bun-plugin-tailwind` and the CLI has no plugin flag:

```ts
await Bun.build({
  entrypoints: ["spikes/single-binary/main.ts"],
  compile: {
    outfile: "/tmp/.../yuekbox-spike",
    assets: [
      "packages/server/src/db/migrations", // -> /$bunfs/root/migrations
      "packages/server/tools",             // -> /$bunfs/root/tools
    ],
  },
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  minify: true,
  sourcemap: "none",
})
```

Without the HTML import, for example if #52 prebuilds `packages/web/dist` and
serves it with a custom handler, the CLI alone is enough:
`bun build --compile --asset=packages/server/src/db/migrations --asset=packages/server/tools --minify`.
Cross-compile adds `compile.target` and `compile.executablePath` (see below).

Flags that mattered:

| Flag | Why |
| --- | --- |
| `compile.assets` | Embeds the migrations tree and the tools tree under `/$bunfs/root/<basename>`. |
| `plugins: [tailwind]` | Compiles the real SPA CSS at build time. No separate `packages/web/dist` step. |
| `minify: true` + `sourcemap: "none"` | One file, 79.8 MB, no sidecar maps. |
| (optional) `compile.target`, `compile.executablePath` | Cross-compile without a runtime download. |

`sourcemap: "linked"` (what `packages/web/build.ts` uses) leaves
`yuekbox-spike.map` and `chunk-*.js.map` sidecars next to the binary. The
binary still runs alone, but a single-file ship should use `"none"`.

Sizes as printed by the build script (MiB): a probe binary with the same
embedded trees but no app code 77.6, app binary 84.2, minified with no
sourcemap 79.8. The app adds about 6.6 MiB and no interpreter.

## One process, one public port

The compiled binary has two listeners in one pid:

- `Bun.serve` on `127.0.0.1:${WEB_PORT:-3000}` is the only public port. It
  serves the embedded SPA at `/*` and proxies `/v1/*` to Fastify.
- Fastify listens on `127.0.0.1:${PORT:-8787}` and is reachable only on
  loopback.

`ss -ltnp` shows both sockets owned by the same pid and no child processes.
This mirrors the current web-proxies-server shape with the second process
removed, and it keeps Fastify streaming and routing exactly as it is today.
The alternative, serving the SPA from Fastify and dropping `Bun.serve`, is one
listener instead of two but needs a custom static handler for hashed assets.
#52 should keep `Bun.serve` in front for parity and use port `0` for Fastify
in standalone mode so the internal port cannot collide.

## SPA embedding and serving

`main.ts` imports `packages/web/src/index.html`. In a compiled build Bun
bundles the HTML entry and every asset it references and replaces the import
with a manifest. `Bun.serve({ routes: { "/*": index } })` serves the HTML, the
hashed assets, and the SPA fallback. `bun-plugin-tailwind` runs during the
compile build, so the CSS comes out compiled and hashed too.

Observed over HTTP from the compiled binary:

```
GET /            -> 200 html, includes /chunk-y1pdjfgx.css and /chunk-b5993gv2.js
GET /chunk-b5993gv2.js -> 200 text/javascript, 1,167,567 bytes
GET /chunk-y1pdjfgx.css -> 200 text/css, 100,051 bytes (tailwind v4.1.14)
GET /songs       -> 200 (SPA fallback)
GET /v1/status   -> 200 (proxied to Fastify)
```

`Bun.embeddedFiles` shows `index-<hash>.html`, `chunk-<hash>.js`, and
`chunk-<hash>.css` inside the binary. `packages/web/dist` is not needed for
the packaged binary.

## Python helper: embed, extract, exec

Build: `--asset=packages/server/tools` embeds the tree at
`/$bunfs/root/tools`. At boot the spike calls the real
`makeInstallScripts` with `join(import.meta.dir, "tools")`, then runs
`python3 <home>/scripts/generate.py --help` through `Bun.spawnSync`.

Observed:

```
[spike] toolsRoot=/tools/ (exists=false) embeddedToolsRoot=/$bunfs/root/tools (exists=true)
[spike] makeInstallScripts failed on embedded source: ... copyfile '/$bunfs/root/tools/lyric-align/align.py' -> ... ENOENT
[spike] falling back to Bun.file bytes + Bun.write
[spike] installed 5 embedded scripts to <home>/scripts (byte-identical=true)
[spike] exec python3 <home>/scripts/generate.py --help -> exit=0
```

Two concrete breaks and their fixes:

1. **`toolsRoot` resolves outside the bundle.**
   `fileURLToPath(new URL("../../tools/", import.meta.url))` compiles to
   `/tools/` because `import.meta.url` is `file:///$bunfs/root/<binary>` and
   `../..` walks out of `root`. The fix for #52:

   ```ts
   export const toolsRoot = Bun.isStandaloneExecutable
     ? join(import.meta.dir, "tools") // --asset=packages/server/tools
     : fileURLToPath(new URL("../../tools/", import.meta.url))
   ```

   `import.meta.dir` is `/$bunfs/root` in standalone mode, so the embedded
   tree is found. The `Bun.isStandaloneExecutable` branch keeps `bun run`
   working, where `import.meta.dir` is still the module's real directory.

2. **`copyFile` cannot read a `$bunfs` source.** It fails with
   `ENOENT: no such file or directory, copyfile '/$bunfs/root/tools/...'`.
   `readFileSync`, `Bun.file().bytes()`, and `Bun.write` all work against
   `$bunfs`. #52 should copy bytes:

   ```ts
   await Bun.write(join(scriptsDir, entry.name), await Bun.file(source).bytes())
   ```

   This works in dev and standalone, so no mode branch is needed.

`Bun.embeddedFiles` lists only the HTML/CSS/JS, the migrations tree, and the
five tool files. There is no Python interpreter and no venv in the binary.
`Bun.which("python3")` reports `/usr/bin/python3`, the system interpreter.
The `--provision` path reaches the real provisioning CLI and, with a fake
`uv` on PATH, runs uv then the interpreter step and exits 1 with the mapped
message, all with zero network calls. Runtimes stay a runtime concern under
`<home>`.

## What survived compilation

| Piece | Result |
| --- | --- |
| Fastify 5 (`server.ts`, routes, error handler) | Works unchanged. Two listeners, one pid. |
| `bun:sqlite` + drizzle (`openDatabase`, `migrate`) | Works unchanged. Migrations ran from the embedded tree and created `__drizzle_migrations`, `ai_config`, `songs`. |
| Workspace import `contracts` | Works. Zod schemas at the route boundary behave the same. |
| `bun-plugin-tailwind` | Works at build time. Tailwind CSS emitted and served from the binary. |
| `Bun.YAML`, `Bun.file`, `Bun.write`, `Bun.spawn`, `homedir()` | Work. |
| CLI parsing (`parseCliArgs(Bun.argv)`) | Works. `Bun.argv` is `["bun", "/$bunfs/root/<name>", ...flags]`; non-flag tokens were already ignored. |
| `--provision` wiring | Works. Steps run, first failure stops with the mapped message. |

## `import.meta` in a compiled binary

The probe (`spikes/single-binary/probe.ts`) printed this for Bun 1.4.2:

```
isStandaloneExecutable: true
import.meta.dir:        /$bunfs/root
import.meta.url:        file:///$bunfs/root/probe-bin
import.meta.file:       probe-bin
Bun.main:               /$bunfs/root/probe-bin
Bun.argv:               ["bun", "/$bunfs/root/probe-bin", ...]
process.execPath:       /tmp/opencode/yuekbox-spike/probe-bin
```

Key points:

- Every bundled module sees the same `import.meta.dir`, `/$bunfs/root`. The
  original per-module source directories do not survive. Any
  `import.meta.dir`-relative path in bundled code resolves against
  `/$bunfs/root`.
- `--asset=<dir>` embeds the tree under `/$bunfs/root/<basename of the asset
  argument>`, not under the full relative path. A basename collision between
  two assets would collide in the bundle.
- `with { type: "file" }` returns `/$bunfs/root/<name>-<hash>.<ext>`, and
  `node:fs` read APIs work on it.
- `Bun.embeddedFiles` names drop the `/$bunfs/root` prefix.

The `db/client.ts` migrations path works by coincidence that #52 should make
intentional: `path.join(import.meta.dir, "migrations")` is
`/$bunfs/root/migrations`, and the asset named `migrations` lands there. A
comment in the build config and a compiled smoke test keep that from drifting.

## CLI flags and config without a project tree

The binary ran from an empty directory with no `package.json`, `tsconfig.json`,
or repo checkout next to it. `resolveBootEnv` behaves the same as in dev:

- `--home <dir>` moves the layout. `--config <file>` moves the file. With no
  flag the home is `$HOME/.yuekbox` and the config is
  `$HOME/.yuekbox/config.yaml`, verified with a scratch `HOME`.
- `config.yaml` is read with `Bun.file` and `Bun.YAML.parse` from the home.
- The five CLI model flags override the file. All five yaml keys resolve, and
  the rest fall back under `<home>/models/...`.
- A missing `config.yaml` means defaults under the home, no error.

Observed with `config.yaml` in a scratch home, then with
`--yue2-model /override/YuE2`:

```
GET /v1/config -> 200 {"models":{"yue2":"/override/YuE2","yue2Vae":"<home>/models/YuE2-Vae", ...}}
```

One hardening note: standalone executables autoload `.env` from the current
directory by default. That is surprising for an app whose config lives in the
home. Set `compile.autoloadDotenv: false` unless #52 wants cwd `.env` files.

## Cross-compile

Cheap and offline when a target runtime is already in Bun's install cache:

```
SPIKE_TARGET=bun-linux-x64-musl \
SPIKE_EXECUTABLE_PATH="$HOME/.bun/install/cache/@oven/bun-linux-x64-musl@1.4.2@@@1/bin/bun" \
bun spikes/single-binary/build.ts /tmp/.../yuekbox-spike-musl
```

That produced a 78.5 MB musl artifact with `interpreter
/lib/ld-musl-x86_64.so.1`. It cannot run on this glibc host because no musl
loader is installed, so the artifact itself was not exercised. Without
`compile.executablePath`, Bun downloads the target runtime from npm, which
this spike did not do. #52 can wire a cached or vendored runtime for release
builds.

## Recommendation for #52

1. **Build script**: add a `scripts/build-binary.ts` that uses `Bun.build`
   with `compile`, the tailwind plugin, `assets: [migrations, tools]`,
   `minify: true`, `sourcemap: "none"`, and `define` of
   `process.env.NODE_ENV`.
2. **Process root**: turn the current two-process shape into one process.
   Keep `Bun.serve` as the public listener serving the HTML import at `/*`
   and proxying `/v1/*`; start Fastify on `127.0.0.1:0` in standalone mode and
   read the assigned port. Reuse the proxy from `packages/web/src/serve.ts`.
3. **`toolsRoot`**: branch on `Bun.isStandaloneExecutable` as shown above,
   with `--asset=packages/server/tools` in the build.
4. **`makeInstallScripts`**: replace `copyFile` with a byte copy, for example
   `Bun.write(dest, await Bun.file(source).bytes())`, so embedded sources
   extract.
5. **Migrations**: no code change needed. Document the `migrations` asset
   name next to `db/client.ts` and cover it with a compiled smoke test.
6. **CI**: add a job that builds the binary and curls `/`, `/v1/status`, and
   `/v1/config` against a temp home, then runs an embedded tool with
   `--help`. The spike's `acceptance.sh` is the draft.
7. **Delete the spike**: `spikes/single-binary/` in full (`main.ts`,
   `build.ts`, `probe*.ts`, `probe-asset/`, `acceptance.sh`, `README.md`).
   Keep this document.

## Evidence

All commands run from the worktree root unless noted. `PATH` included
`$HOME/.bun/bin`.

```sh
bun --version                                              # 1.4.2
bun spikes/single-binary/build.ts /tmp/opencode/yuekbox-spike/yuekbox-spike
spikes/single-binary/acceptance.sh                         # all checks passed
```

`acceptance.sh` covers every acceptance item in order:

- build the binary
- start it, then self-fetch `/v1/status` (200, `state: online`), `/v1/config`
  (200, five paths from `config.yaml`), and `/` (200, HTML with `id="root"`)
- rerun with `--yue2-model /override/YuE2` and check the flag wins while yaml
  keys stay
- rerun with no `--home` and a scratch `HOME`, check `$HOME/.yuekbox/config.yaml`
  is the file that loads
- run `--config <other-file>` with an empty home and check the file is read
- run `--provision` with a fake `uv` first on PATH, expect exit 1 and the
  mapped message with no downloads

`bun run check` exits 0 with the spike in the tree. `spikes/` is outside the
workspace packages, so lint, boundaries, typecheck, and tests never see it.
