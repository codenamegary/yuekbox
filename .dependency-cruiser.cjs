// @ts-check
// Architecture rules for the server and cli module graphs, per the
// typescript-dev-backend skill.
//
// Layer direction: routes and assemblies wire use cases, use cases depend on ports,
// ports depend on models, adapters implement ports. Slices talk through capability
// ports, never through another slice's adapters. The cli package mirrors the same
// shape: its use cases depend on ports, and only its process root (main.ts) wires
// adapters and reaches into the server package.
//
// dependency-cruiser owns the rules that need the whole graph. Per-file import
// boundaries (what a use case, model, port, or test may import) live in
// packages/server/.oxlintrc.json and packages/cli/.oxlintrc.json. Rule messages
// quote the skill on purpose.

const SERVER = "packages/server/src"
const CLI = "packages/cli/src"

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "backend skill: the module graph stays acyclic",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-cross-slice-adapters",
      comment:
        "backend skill: slices talk through capability ports, never another slice's adapters",
      severity: "error",
      from: { path: `^${SERVER}/([^/]+)/`, pathNot: `^${SERVER}/(db|shared)/` },
      to: {
        path: `^${SERVER}/([^/]+)/[^/]*\\.adapters\\.ts$`,
        pathNot: `^${SERVER}/$1/`,
      },
    },
    {
      name: "adapters-mounted-at-composition",
      comment: "backend skill: only assemblies, routes, the process roots, and tests wire adapters",
      severity: "error",
      from: {
        pathNot: `(\\.assembly\\.ts|\\.routes\\.ts|compose\\.ts|server\\.ts)$|^${CLI}/main\\.ts$|\\.test\\.ts$`,
      },
      to: { path: `^${SERVER}/.*\\.adapters\\.ts$` },
    },
    {
      name: "db-through-adapters",
      comment:
        "backend skill: only adapters, assemblies, the process roots, and tests reach the database",
      severity: "error",
      from: {
        pathNot: `(\\.adapters\\.ts|\\.assembly\\.ts)$|^${SERVER}/(db|compose\\.ts|server\\.ts)|^${CLI}/main\\.ts$|\\.test\\.ts$`,
      },
      to: { path: `^${SERVER}/db/(client|db\\.schema)\\.ts$` },
    },
    {
      name: "cli-no-cross-slice-adapters",
      comment:
        "backend skill: slices talk through capability ports, never another slice's adapters",
      severity: "error",
      from: { path: `^${CLI}/([^/]+)/`, pathNot: `^${CLI}/checks/` },
      to: {
        path: `^${CLI}/([^/]+)/[^/]*\\.adapters\\.ts$`,
        pathNot: `^${CLI}/$1/`,
      },
    },
    {
      name: "cli-adapters-mounted-at-composition",
      comment: "backend skill: only the process root and tests wire adapters",
      severity: "error",
      from: { pathNot: `^${CLI}/main\\.ts$|\\.test\\.ts$` },
      to: { path: `^${CLI}/.*\\.adapters\\.ts$` },
    },
    {
      name: "cli-server-only-at-composition",
      comment: "backend skill: only the process root and tests reach into the server package",
      severity: "error",
      from: { path: `^${CLI}/`, pathNot: `^${CLI}/main\\.ts$|\\.test\\.ts$` },
      to: { path: `^${SERVER}/` },
    },
    {
      name: "no-orphans",
      comment: "backend skill: every module is reachable from an entry point or a test",
      severity: "error",
      from: { orphan: true, pathNot: `\\.test\\.ts$` },
      to: {},
    },
  ],
  options: {
    // swc parses TypeScript here: the repo's typescript@7 is the native compiler
    // and has no JS API for dependency-cruiser to use.
    parser: "swc",
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".jsx", ".json"] },
  },
}
