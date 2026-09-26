# Server

Fastify, SQLite, and Bun. Capabilities are vertical slices, one folder per slice
under `src/`. This package follows the `typescript-dev-backend` skill, and three
check layers enforce it (see [Checks](#checks)).

## Layout

| File | Role |
| --- | --- |
| `<slice>.models.ts` | Domain types, error unions, boundary schemas |
| `<slice>.ports.ts` | Atomic function types the slice needs from the outside |
| `<slice>.<action>.usecase.ts` | Curried factory: `make<Action>(deps)(input)` |
| `<slice>.<driver>.adapters.ts` | Concrete implementations of ports |
| `<slice>.routes.ts` | Fastify plugin: validates input, calls use cases, maps `Result` to HTTP |
| `<slice>.assembly.ts` | Wires adapters to use cases and exposes capability ports |

Dependencies point inward: routes and assemblies wire use cases, use cases depend
on ports, ports depend on models, adapters implement ports. Only assemblies,
routes, `compose.ts`, the process roots (`server.ts`, `binary.ts`), and tests
wire adapters. Slices talk through capability ports, never through another
slice's adapters.

`src/checks/` holds the structure check itself. It is tooling, not a slice.

## Checks

Three layers run in CI on every pull request. Each failure message quotes the
backend skill so the fix is obvious.

1. `bun run lint` (oxlint, per package) covers import boundaries and test purity:
   - `.usecase.ts` files cannot import Fastify, a database driver, the filesystem, adapters, routes, or assemblies.
   - `.models.ts` and `.ports.ts` files depend inward only.
   - `.test.ts` files cannot import jest or vitest, and cannot import `mock` or `spyOn` from `bun:test`.
2. `bun run lint:boundaries` (dependency-cruiser, root) covers the whole graph:
   - no dependency cycles;
   - a slice never imports another slice's adapters;
   - only assemblies, routes, `compose.ts`, the process roots (`server.ts`, `binary.ts`), and tests import adapters;
   - only adapters, assemblies, the process root, and tests import `db/client.ts` or `db/db.schema.ts`;
   - no orphan modules.

   The repo's `typescript@7` is the native compiler with no JS API, so
   dependency-cruiser parses TypeScript with `@swc/core` (`options.parser`).
3. `bun test` (structure check in `src/checks/`) covers shapes lint cannot see:
   - every `.usecase.ts` exports a curried `make<Action>` factory;
   - no `.ports.ts` exports a record bundling two or more functions, the
     `AudioStore` failure mode.

Run all of it from the repo root with `bun run check`.

## Ratchet

The rules cover the whole `packages/server` tree and are green. Fix a violation
in the code, or discuss it in review before widening a config. Semantic rules
stay with types and review: pure use cases, capability ports, error unions,
frozen returns, and Zod at the route boundary. When oxlint grows a rule that
replaces part of the structure check, delete that part.
