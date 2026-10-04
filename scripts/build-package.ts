// Builds the npm package that replaces the compiled binary (#99).
//
// The output is a publishable package directory, not an executable: `Bun.build` with `target: "bun"` and an `outdir`
// writes real files, so the SPA manifest, migrations, and Python tools ship
// as package contents rather than embedded bytes. The packed tarball is what
// release-npm.yml publishes via trusted publishing.
//
//   bun run build:package [outdir]
//
// The directory contract lives in verifyPackageDir and is pinned by
// build-package.test.ts; the script refuses to leave a directory that fails
// it, because what this script writes is what npm ships.

import { chmod, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import tailwind from "../packages/web/node_modules/bun-plugin-tailwind"

const repoRoot = path.resolve(import.meta.dir, "..")

export type PackageDirContract = Readonly<{ version: string }>

const REPOSITORY_URL = "git+https://github.com/codenamegary/yuekbox.git"
const MIN_BUN = ">=1.4.2"

/**
 * Everything that must be true of the built package directory before it may
 * be packed. Violations are collected so one run reports every problem, not
 * just the first.
 */
export const verifyPackageDir = async (
  dir: string,
  contract: PackageDirContract,
): Promise<void> => {
  const problems: string[] = []
  const problem = (message: string): void => {
    problems.push(message)
  }

  const pkgRaw = await readFile(path.join(dir, "package.json"), "utf8").catch(() => null)
  if (pkgRaw === null) {
    problem("package.json is missing")
  } else {
    const pkg = JSON.parse(pkgRaw) as Record<string, unknown>

    if (pkg.name !== "yuekbox") problem(`package.json name must be "yuekbox"`)
    if (pkg.version !== contract.version) {
      problem(`package.json version must match the release (${contract.version})`)
    }
    if (pkg.private === true) problem("package.json must not be private")
    if (pkg.type !== "module") problem("package.json type must be module")
    if (pkg.license !== "MIT") problem("package.json license must be MIT")
    if ("scripts" in pkg) {
      problem("package.json must not declare scripts (no lifecycle scripts policy)")
    }
    if ("dependencies" in pkg || "devDependencies" in pkg) {
      problem("package.json must not declare dependencies (the bundle carries everything)")
    }
    if (
      pkg.engines === null ||
      typeof pkg.engines !== "object" ||
      !("bun" in (pkg.engines ?? {}))
    ) {
      problem(`package.json engines must pin bun ${MIN_BUN}`)
    } else if ((pkg.engines as Record<string, string>).bun !== MIN_BUN) {
      problem(`package.json engines must pin bun ${MIN_BUN}`)
    }
    const repository = pkg.repository as { url?: string } | undefined
    if (repository?.url !== REPOSITORY_URL) {
      problem(
        `package.json repository.url must be ${REPOSITORY_URL} (trusted publishing matches it)`,
      )
    }
    const os = pkg.os as string[] | undefined
    if (
      !Array.isArray(os) ||
      !os.includes("linux") ||
      !os.includes("darwin") ||
      os.includes("win32")
    ) {
      problem(`package.json os must be exactly linux and darwin`)
    }

    const bin = pkg.bin as { yuekbox?: string } | undefined
    if (typeof bin?.yuekbox !== "string") {
      problem(`package.json bin must map yuekbox to server.js`)
    } else {
      const binPath = path.join(dir, bin.yuekbox)
      const binStat = await stat(binPath).catch(() => null)
      if (binStat === null) {
        problem(`bin entry ${bin.yuekbox} does not exist`)
      } else {
        if (!(binStat.mode & 0o111)) problem(`bin entry ${bin.yuekbox} must be executable`)
        const firstLine = (await readFile(binPath, "utf8")).split("\n")[0]
        if (firstLine !== "#!/usr/bin/env bun") {
          problem(`bin entry ${bin.yuekbox} must start with the #!/usr/bin/env bun shebang`)
        }
      }
    }
  }

  const migrations = await readdir(path.join(dir, "migrations")).catch(() => null)
  if (migrations === null) {
    problem("migrations/ is missing")
  } else if (!migrations.some((file) => file.endsWith(".sql"))) {
    problem("migrations/ contains no .sql files")
  }

  for (const helper of [
    path.join("tools", "yue2", "generate.py"),
    path.join("tools", "sheetsage2", "transcribe.py"),
    path.join("tools", "lyric-align", "align.py"),
  ]) {
    const helperStat = await stat(path.join(dir, helper)).catch(() => null)
    if (helperStat === null) problem(`tools helper ${helper} is missing`)
  }

  const htmlManifestPath = path.join(dir, "server.html")
  const htmlManifest = await readFile(htmlManifestPath, "utf8").catch(() => null)
  if (htmlManifest === null) {
    problem("the SPA shell (server.html) is missing from the build")
  } else if (!htmlManifest.includes("chunk-")) {
    problem("server.html does not reference the hashed chunk assets")
  }

  if (problems.length > 0)
    throw new Error(`package dir ${dir} failed the contract:\n- ${problems.join("\n- ")}`)
}

const copyDir = async (from: string, to: string): Promise<void> => {
  await mkdir(path.dirname(to), { recursive: true })
  await cp(from, to, { recursive: true })
}

const build = async (): Promise<void> => {
  const outdirArg = Bun.argv[2]
  const outdir = outdirArg ? path.resolve(outdirArg) : path.join(repoRoot, "dist", "yuekbox")
  const version = (
    JSON.parse(await Bun.file(path.join(repoRoot, "package.json")).text()) as { version: string }
  ).version

  await rm(outdir, { recursive: true, force: true })
  await mkdir(outdir, { recursive: true })

  const result = await Bun.build({
    entrypoints: [path.join(repoRoot, "packages/cli/src/main.ts")],
    outdir,
    target: "bun",
    naming: { entry: "server.[ext]", chunk: "chunk-[hash].[ext]" },
    plugins: [tailwind],
    // Marks the npm bundle layout: provisioning resolves tools/ next to the
    // entry instead of ../../tools/ next to the source, and main.ts serves
    // the hashed chunks from the package dir instead of via the html
    // manifest's cwd-relative resolution.
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.YUEKBOX_BUNDLED": JSON.stringify("1"),
    },
    // The bin needs a shebang to run under npx/bunx/npm global installs.
    banner: "#!/usr/bin/env bun\n",
    minify: true,
    sourcemap: "none",
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error(`build failed with ${result.logs.length} log(s)`)
  }

  await copyDir(
    path.join(repoRoot, "packages/server/src/db/migrations"),
    path.join(outdir, "migrations"),
  )
  await copyDir(path.join(repoRoot, "packages/server/tools"), path.join(outdir, "tools"))
  await Bun.write(path.join(outdir, "README.md"), Bun.file(path.join(repoRoot, "README.md")))
  await Bun.write(path.join(outdir, "LICENSE"), Bun.file(path.join(repoRoot, "LICENSE")))

  const packageJson = {
    name: "yuekbox",
    version,
    description:
      "A local YuE2 music studio with a winamp soul. You, a GPU, and questionable lyrics.",
    license: "MIT",
    author: "Gary Saunders",
    homepage: "https://github.com/codenamegary/yuekbox#readme",
    bugs: "https://github.com/codenamegary/yuekbox/issues",
    repository: { type: "git", url: REPOSITORY_URL },
    keywords: ["yue2", "music", "local-ai", "audio", "visualizer"],
    type: "module",
    engines: { bun: MIN_BUN },
    os: ["linux", "darwin"],
    bin: { yuekbox: "server.js" },
  }
  await writeFile(path.join(outdir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`)

  // Banner output inherits no exec bit on every platform; set it explicitly.
  await chmod(path.join(outdir, "server.js"), 0o755)

  await verifyPackageDir(outdir, { version })

  const { size } = await stat(path.join(outdir, "server.js"))
  console.log(`${outdir}  server.js ${(size / 1024 / 1024).toFixed(1)} MiB  v${version}`)
}

if (import.meta.main) await build()
