// Throwaway build script for issue #51. NOT production code.
//
// Bun.build is used instead of `bun build --compile` on the CLI because the
// HTML import needs the Tailwind plugin, and the CLI has no plugin flag for
// `bun build` (plugins only work through the JS API or the dev server's
// bunfig.toml).
//
//   bun spikes/single-binary/build.ts [outfile]
import { rm } from "node:fs/promises"
import path from "node:path"
// The web package owns the plugin, so it is not hoisted to the root
// node_modules. The spike reaches into the package on purpose.
import tailwind from "../../packages/web/node_modules/bun-plugin-tailwind"

const here = import.meta.dir
const repoRoot = path.resolve(here, "../..")
const outfile = Bun.argv[2] ?? path.join("/tmp/opencode/yuekbox-spike", "yuekbox-spike")

await rm(outfile, { force: true })

const result = await Bun.build({
  entrypoints: [path.join(here, "main.ts")],
  compile: {
    outfile,
    // Cross-compile needs a local runtime binary; the offline copy lives in
    // Bun's install cache. Without it, `--target` downloads from npm.
    ...(process.env.SPIKE_TARGET === undefined ? {} : { target: process.env.SPIKE_TARGET }),
    ...(process.env.SPIKE_EXECUTABLE_PATH === undefined
      ? {}
      : { executablePath: process.env.SPIKE_EXECUTABLE_PATH }),
    // Basename-rooted under /$bunfs/root, so:
    //   db/client.ts's path.join(import.meta.dir, "migrations") -> /$bunfs/root/migrations
    //   the spike's path.join(import.meta.dir, "tools")          -> /$bunfs/root/tools
    assets: [
      path.join(repoRoot, "packages/server/src/db/migrations"),
      path.join(repoRoot, "packages/server/tools"),
    ],
  },
  plugins: [tailwind],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  minify: process.env.SPIKE_MINIFY === "1",
  sourcemap: process.env.SPIKE_SOURCEMAP === "0" ? "none" : "linked",
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

for (const output of result.outputs) {
  const { size } = await Bun.file(output.path).stat()
  console.log(`${output.path}  ${(size / 1024 / 1024).toFixed(1)} MB`)
}
