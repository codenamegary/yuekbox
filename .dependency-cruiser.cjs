// @ts-check
// Architecture rules for the server module graph, per the typescript-dev-backend skill.
//
// Layer direction: routes and assemblies wire use cases, use cases depend on ports,
// ports depend on models, adapters implement ports. Slices talk through capability
// ports, never through another slice's adapters.
//
// dependency-cruiser owns the rules that need the whole graph. Per-file import
// boundaries (what a use case, model, port, or test may import) live in
// packages/server/.oxlintrc.json. Rule messages quote the skill on purpose.

const SERVER = "packages/server/src"

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
        pathNot: `(\\.assembly\\.ts|\\.routes\\.ts|compose\\.ts|server\\.ts|binary\\.ts)$|\\.test\\.ts$`,
      },
      to: { path: `^${SERVER}/.*\\.adapters\\.ts$` },
    },
    {
      name: "db-through-adapters",
      comment:
        "backend skill: only adapters, assemblies, the process roots, and tests reach the database",
      severity: "error",
      from: {
        pathNot: `(\\.adapters\\.ts|\\.assembly\\.ts)$|^${SERVER}/(db|compose\\.ts|server\\.ts|binary\\.ts)|\\.test\\.ts$`,
      },
      to: { path: `^${SERVER}/db/(client|db\\.schema)\\.ts$` },
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
