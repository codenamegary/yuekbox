# Releasing yuekbox

A release is the npm package `yuekbox`: web UI, Fastify API, SQLite schema
and migrations, and the Python helper scripts in one tarball, published with
provenance from CI. It runs on [Bun](https://bun.sh) 1.4.2+. Nothing bundles
CUDA, PyTorch, Python, ffmpeg, or model weights. Those are a machine
prerequisite and a runtime download, set up by `yuekbox --provision` and the
app's model downloads.

## What a release ships

| Where | What |
| --- | --- |
| [npmjs.com/package/yuekbox](https://www.npmjs.com/package/yuekbox) | The tarball `npm i -g yuekbox` installs, with a provenance attestation linking it to the workflow run and commit. |
| The GitHub release | The changelog plus the packaging note (install commands and prerequisites). |

The npm version is immutable: once `yuekbox@X.Y.Z` is on the registry it
cannot be replaced, only superseded by a newer release.

## How a release is cut

1. release-please opens a release PR from merged conventional commits
   (`feat` and `fix` bump the version; `chore`, `ci`, and `refactor` do not).
2. Merging the PR tags `vX.Y.Z` and publishes the GitHub release
   (`force-tag-creation` in `release-please-config.json`; there are no
   release assets, so no draft step).
3. Publishing the release starts `.github/workflows/release-npm.yml` from the
   Release Please workflow. The workflow is called directly and also accepts
   manual dispatch.
4. The workflow checks out the tag, runs `bun install --frozen-lockfile`,
   builds the package (`bun run build:package`), and packs it
   (`npm pack` inside `dist/yuekbox`).
5. It smokes the packed tarball in parallel: `scripts/smoke-package.sh` on
   ubuntu-latest and on a native macOS arm64 runner. The smoke installs the
   tarball into a scratch global prefix and drives the installed `yuekbox`
   through detached start, `status --json`, an idempotent second start, the
   SPA shell and its hashed chunks, `/v1/status`, `/v1/config` precedence, an
   extracted Python helper, stop, and `uninstall --purge`.
6. The `publish` job waits for both smokes, then runs `npm publish` under
   OIDC trusted publishing (`id-token: write`, no `NPM_TOKEN` secret). npm
   attaches the provenance attestation automatically.
7. Finally it appends `.github/release-notes-packaging.md` to the release
   body with `scripts/release-notes-append.sh`; the
   `<!-- yuekbox-packaging -->` marker guards the append, so a rerun leaves
   the body alone.

The workflow runs from the Release Please workflow and on manual dispatch
only. It never runs on pull requests; `ci.yml` smokes a fresh tarball on
every PR instead.

## Prerequisites (one time)

The npmjs package lists its trusted publishers under
Package settings → Trusted publishing. Both entries matter:

- `.github/workflows/release-npm.yml` — direct runs and manual dispatches.
- `.github/workflows/release-please.yml` — a `workflow_call` invocation can
  be validated under the calling workflow's name, so the caller is
  registered too.

The filename is part of the trust check: renaming either workflow requires
updating the npmjs settings. Publishing also needs the `id-token: write`
permission, which both workflows carry, and a GitHub-hosted runner
(self-hosted runners are not supported). See
[Trusted publishing with OIDC](https://docs.npmjs.com/trusted-publishers).

## The Apple Silicon bench

A release that touched the darwin paths, a Python tool, or a runtime pin is
not supported macOS until `.github/workflows/darwin-verify.yml` ran green on
its commit. The bench is a manual dispatch on a macOS arm64 runner: it builds
and packs the npm package, smokes the tarball, installs it globally, then
provisions the pinned runtimes into an empty home, downloads the pinned
macOS model set, generates one freeform Song on the MLX runtime (checking
the lyric calibration came back), and cuts one cover through the MLX
transcriber. Artifacts and the server log upload with the run.

```sh
gh workflow run darwin-verify.yml
gh run watch   # then read the artifacts
```

Model downloads need roughly 15 GiB of disk and the two Songs take a while
on the hosted M1; budget an hour for a full run.

## Retry a failed npm publish

npm versions are immutable, so a failed publish is retried against the same
tag — the tag's tree always contains the packaging scripts:

```sh
gh workflow run release-npm.yml -f tag=v0.6.0
```

If the failure was the OIDC trust check, fix the trusted publishers on
npmjs.com first. A version that already reached the registry cannot be
replaced; cut a new release instead.

## Local end to end

```sh
bun run build:package                 # builds dist/yuekbox, verifies the contract
(cd dist/yuekbox && npm pack)         # writes yuekbox-<version>.tgz
./scripts/smoke-package.sh            # installs and drives the packed tarball
bun test scripts/                     # the package-dir contract tests
bash scripts/release-notes.test.sh    # the release-note append test
```

## Manual test on a clean machine

Run this once per packaging change. Use a Linux or WSL2 machine with an NVIDIA
GPU — or a Mac with Apple Silicon — with Bun installed and no checkout.

1. Install the latest release:

   ```sh
   npm i -g yuekbox
   ```

2. Confirm `command -v yuekbox` prints a path and `yuekbox --help` runs. The
   bin is a bun-shebang script inside the global `node_modules`; npm prints
   its location.
3. Set up the runtime: `yuekbox --provision`. Needs the NVIDIA driver (Linux)
   or nothing but network (macOS), plus network access. It builds the Python
   environment(s) under `~/.yuekbox` — one on Linux, two on macOS.
4. Start the app: `yuekbox`. Open <http://127.0.0.1:3000>. `GET /v1/status`
   reports `ffmpeg` and `yue2`.
5. Try it without installing on a second machine or a scratch prefix:
   `npx yuekbox`, then confirm the app serves on :3000.
6. `yuekbox uninstall --purge` removes the home and the installed entry. It
   must never touch the bun runtime itself.
