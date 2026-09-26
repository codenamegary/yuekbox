# Single-binary spike (#51)

Throwaway prototype. Do not ship this code. The findings live in
`docs/single-binary-spike.md`; delete everything here when #52 lands.

The spike compiles **one** executable that boots the real
`packages/server/src/server.ts` (Fastify + bun:sqlite + drizzle migrations +
config + provisioning CLI), serves the real SPA from
`packages/web/src/index.html` embedded at build time, and extracts the real
`packages/server/tools/**` Python helpers under a scratch home before running
`generate.py --help` with the system `python3`.

## Files

| File | Role |
| --- | --- |
| `main.ts` | Compiled entrypoint. Imports `server.ts` for its real side effects, adds `Bun.serve` for the SPA and the `/v1` proxy, then installs and execs the embedded tools. |
| `build.ts` | `Bun.build` + `compile` + `bun-plugin-tailwind`. This is the only way to use plugins with `--compile`. |
| `probe.ts`, `probe-other.ts`, `probe-asset/` | Standalone probe for `import.meta.dir`/`url`, `Bun.embeddedFiles`, and `--asset` rooting. |
| `acceptance.sh` | Rebuilds and runs every acceptance item against a scratch home. |

## Run it

```sh
export PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/v22.17.0/bin:$PATH"
bun spikes/single-binary/build.ts /tmp/opencode/yuekbox-spike/yuekbox-spike
spikes/single-binary/acceptance.sh
```

`acceptance.sh` never touches the real `~/.yuekbox`. It writes only under
`/tmp/opencode/yuekbox-spike` unless `SPIKE_SCRATCH` overrides the root.
