// Builds the single-file `yuekbox` executable (#52).
//
// `bun build --compile` on the command line cannot run plugins, and the SPA
// entry is an HTML import that needs `bun-plugin-tailwind`, so this script
// drives the `Bun.build` JS API instead. The findings behind this shape live in
// docs/single-binary-spike.md.
//
//   bun run build:binary [outfile] [--target <bun-target>] [--executable <path>]
//
// Defaults to `./yuekbox` for the host platform. `--target` cross-compiles (for
// example `bun-linux-x64-musl`); `--executable` points at a local Bun runtime
// for that target so the build stays offline. `macos-arm64` is not a supported
// target: yuekbox needs a local NVIDIA GPU, so it ships for Linux/WSL2 only.
import { rm } from "node:fs/promises"
import path from "node:path"
import tailwind from "../packages/web/node_modules/bun-plugin-tailwind"

const repoRoot = path.resolve(import.meta.dir, "..")

type BuildArgs = Readonly<{
  outfile: string
  target: Bun.Build.CompileTarget | null
  executablePath: string | null
}>

const usage = "usage: bun run build:binary [outfile] [--target <bun-target>] [--executable <path>]"

const readFlagValue = (flag: string, inline: string | null, next: string | undefined): string => {
  if (inline !== null) {
    if (inline === "") throw new Error(`${flag} needs a value`)
    return inline
  }
  if (next === undefined || next.startsWith("--")) throw new Error(`${flag} needs a value`)
  return next
}

/**
 * The compile targets yuekbox supports. yuekbox needs a local NVIDIA GPU, so
 * the ship targets are Linux; the case arms are checked against
 * Bun.Build.CompileTarget, so a typo never typechecks.
 */
const parseTarget = (value: string): Bun.Build.CompileTarget => {
  switch (value) {
    case "bun-linux-x64":
    case "bun-linux-x64-musl":
    case "bun-linux-arm64":
    case "bun-linux-arm64-musl":
      return value
    default:
      throw new Error(`unsupported --target ${value}: yuekbox ships for Linux and WSL2 only`)
  }
}

type ParsedArgs = Readonly<{
  outfile: string | null
  target: Bun.Build.CompileTarget | null
  executablePath: string | null
}>

const readArgs = (argv: readonly string[]): ParsedArgs => {
  const [token, ...rest] = argv
  if (token === undefined) return { outfile: null, target: null, executablePath: null }

  if (!token.startsWith("--")) {
    const tail = readArgs(rest)
    // The last positional outfile wins, so the tail's choice takes priority.
    return { ...tail, outfile: tail.outfile ?? path.resolve(token) }
  }

  const equals = token.indexOf("=")
  const flag = equals === -1 ? token : token.slice(0, equals)
  const inline = equals === -1 ? null : token.slice(equals + 1)
  if (flag !== "--target" && flag !== "--executable") {
    throw new Error(`unknown flag: ${flag}\n${usage}`)
  }

  const value = readFlagValue(flag, inline, rest[0])
  const tail = readArgs(inline === null ? rest.slice(1) : rest)
  // Later flags win, so the tail spreads over the value read here.
  return flag === "--target"
    ? { ...tail, target: parseTarget(value) }
    : { ...tail, executablePath: value }
}

const parseArgs = (argv: readonly string[]): BuildArgs => {
  const parsed = readArgs(argv)
  return {
    outfile: parsed.outfile ?? path.join(repoRoot, "yuekbox"),
    target: parsed.target,
    executablePath: parsed.executablePath,
  }
}

const build = async (): Promise<void> => {
  const args = parseArgs(Bun.argv.slice(2))
  await rm(args.outfile, { force: true })

  const result = await Bun.build({
    entrypoints: [path.join(repoRoot, "packages/server/src/binary.ts")],
    compile: {
      outfile: args.outfile,
      // yuekbox reads no .env; configuration lives in the home.
      autoloadDotenv: false,
      ...(args.target === null ? {} : { target: args.target }),
      ...(args.executablePath === null ? {} : { executablePath: args.executablePath }),
      // Asset trees land basename-rooted under /$bunfs/root in the executable:
      //   db/client.ts's path.join(import.meta.dir, "migrations") -> /$bunfs/root/migrations
      //   toolsRoot's    path.join(import.meta.dir, "tools")      -> /$bunfs/root/tools
      assets: [
        path.join(repoRoot, "packages/server/src/db/migrations"),
        path.join(repoRoot, "packages/server/tools"),
      ],
    },
    plugins: [tailwind],
    // Baked in so the web bundle and React ship production code.
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    minify: true,
    sourcemap: "none",
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error(`build failed with ${result.logs.length} log(s)`)
  }

  const { size } = await Bun.file(args.outfile).stat()
  console.log(`${args.outfile}  ${(size / 1024 / 1024).toFixed(1)} MiB`)
}

await build()
