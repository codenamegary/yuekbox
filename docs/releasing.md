# Releasing yuekbox

The release ships two executables: `yuekbox-linux-x64` for Linux x86_64 and
WSL2 with an NVIDIA GPU, and `yuekbox-darwin-arm64` for macOS on Apple
Silicon (M1 or newer, macOS 14.2+, 16 GiB unified memory floor), where
generation runs on the GPU through the pinned MLX runtime. Neither binary
bundles CUDA, PyTorch, Python, ffmpeg, or model weights. Those are a machine
prerequisite and a runtime download, set up by `yuekbox --provision` and the
app's model downloads.

## What a release ships

| Asset | Purpose |
| --- | --- |
| `yuekbox-linux-x64` | The compiled executable for Linux x86_64 / WSL2. |
| `yuekbox-linux-x64.sha256` | SHA-256 of the executable. The installer checks it. |
| `yuekbox-darwin-arm64` | The compiled executable for Apple Silicon macOS. |
| `yuekbox-darwin-arm64.sha256` | SHA-256 of the executable. The installer checks it. |
| `install.sh` | The installer served by the one-line command. |

Asset names are stable. The installer reads them from
`releases/latest/download/<asset>` or `releases/download/<tag>/<asset>`.
Releases are immutable, so once published neither the assets nor the tag can
change. Everything the installer needs is attached while the release is still
a draft.

## How a release is cut

1. release-please opens a release PR from merged conventional commits.
2. Merging the PR tags `vX.Y.Z` and creates the GitHub release as a draft.
   The release-please config sets `draft` and `force-tag-creation` for this.
3. Creating the draft starts `.github/workflows/release-binaries.yml` from the
   Release Please workflow. Draft releases fire no `release` event, so the
   workflow is called directly.
4. The workflow builds both targets in parallel: `linux-x64` on ubuntu-latest
   and `darwin-arm64` on a native macOS arm64 runner. Each checks out the
   tag, runs `bun install --frozen-lockfile`, builds the binary, runs
   `scripts/smoke-binary.sh`, writes the `.sha256`, and uploads its assets
   with `gh release upload --clobber`. The darwin binary is ad-hoc
   codesigned before the smoke test (every arm64 binary needs a signature).
5. The `publish` job waits for both builds, then appends
   `.github/release-notes-packaging.md` to the release body. The
   `<!-- yuekbox-packaging -->` marker guards the append, so a second run
   leaves the body alone.
6. It publishes the draft with `gh release edit --draft=false`. Publishing is
   last on purpose: the assets and the tag lock together at that moment, and
   only after both platforms are green.

The workflow runs from the Release Please workflow and on manual dispatch
only. It never runs on pull requests.

## The Apple Silicon bench

A release that touched the darwin paths, a Python tool, or a runtime pin is
not supported macOS until `.github/workflows/darwin-verify.yml` ran green on
its commit. The bench is a manual dispatch on a macOS arm64 runner: it
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

Retry a release whose build failed before it published:

```sh
gh workflow run release-binaries.yml -f tag=v0.3.2
```

The draft is still unpublished, so the workflow can upload the assets and
publish it. Once a release is published it cannot change. If the assets are
wrong, cut a new patch release.

## Test the installer without a release

`scripts/install.test.sh` starts a throwaway HTTP server with fake binaries and
checksums, then drives `scripts/install.sh` through `YUEKBOX_BASE_URL`. It covers
the happy path, a checksum mismatch, platform selection (darwin-arm64 on
Apple Silicon) and refusals (Intel Mac, Linux ARM), and the release URLs:

```sh
sh scripts/install.test.sh
```

`scripts/release-notes.test.sh` drives the note append with a `gh` shim and
checks that a rerun changes nothing:

```sh
bash scripts/release-notes.test.sh
```

End to end against a real binary:

```sh
bun run build:binary /tmp/yuekbox-release/yuekbox-linux-x64
cd /tmp/yuekbox-release
sha256sum yuekbox-linux-x64 > yuekbox-linux-x64.sha256
python3 -m http.server 8123 --bind 127.0.0.1 --directory .
```

In another shell, from the repo root:

```sh
YUEKBOX_BASE_URL=http://127.0.0.1:8123 \
YUEKBOX_INSTALL_DIR=/tmp/yuekbox-bin \
sh scripts/install.sh
```

The installer downloads both files, verifies the checksum, and installs
`/tmp/yuekbox-bin/yuekbox`.

## Manual test on a clean machine

Run this once per packaging change. Use a Linux or WSL2 machine with an NVIDIA
GPU — or a Mac with Apple Silicon — with no Bun and no checkout.

1. Install the latest release:

   ```sh
   curl -fsSL https://github.com/codenamegary/yuekbox/releases/latest/download/install.sh | sh
   ```

2. Confirm `~/.local/bin/yuekbox` exists and is executable. The installer
   printed no checksum error, and it installed the asset for that machine
   (`yuekbox-linux-x64` or `yuekbox-darwin-arm64`).
3. Set up the runtime: `yuekbox --provision`. Needs the NVIDIA driver (Linux)
   or nothing but network (macOS), plus network access. It builds the Python
   environment(s) under `~/.yuekbox` — one on Linux, two on macOS.
4. Start the app: `yuekbox`. Open <http://127.0.0.1:3000>. `GET /v1/status`
   reports `ffmpeg` and `yue2`.
5. Pin a version with `YUEKBOX_VERSION=v0.3.0` and confirm the same result.
6. Move the install with `YUEKBOX_INSTALL_DIR=/tmp/yuekbox-bin` and confirm the
   binary lands there.
7. Serve a wrong checksum over a local mirror, point `YUEKBOX_BASE_URL` at it,
   and confirm the installer installs nothing and fails loudly.
