# Releasing yuekbox

The release artifact is `yuekbox-linux-x64`, one executable for Linux x86_64
and WSL2 with an NVIDIA GPU. macOS is not supported. The binary does not bundle
CUDA, PyTorch, Python, ffmpeg, or model weights. Those are a machine
prerequisite and a runtime download, set up by `yuekbox --provision` and the
app's model downloads.

## What a release ships

| Asset | Purpose |
| --- | --- |
| `yuekbox-linux-x64` | The compiled executable. |
| `yuekbox-linux-x64.sha256` | SHA-256 of the executable. The installer checks it. |
| `install.sh` | The installer served by the one-line command. |

Asset names are stable. The installer reads them from
`releases/latest/download/<asset>` or `releases/download/<tag>/<asset>`.

## How a release is cut

1. release-please opens a release PR from merged conventional commits.
2. Merging the PR tags `vX.Y.Z` and publishes the GitHub release.
3. The published release starts `.github/workflows/release-binaries.yml`.
4. The workflow checks out the tag, runs `bun install --frozen-lockfile`,
   builds the binary, runs `scripts/smoke-binary.sh`, and writes
   `yuekbox-linux-x64.sha256`.
5. It uploads the binary, the checksum, and `scripts/install.sh` with
   `gh release upload --clobber`.
6. It appends `.github/release-notes-packaging.md` to the release body. The
   `<!-- yuekbox-packaging -->` marker guards the append, so a second run
   leaves the body alone.

The workflow runs on `release: published` and on manual dispatch only. It never
runs on pull requests.

Rebuild the assets for an existing tag after a failed build or a bad upload:

```sh
gh workflow run release-binaries.yml -f tag=v0.3.0
```

## Test the installer without a release

`scripts/install.test.sh` starts a throwaway HTTP server with a fake binary and
checksum, then drives `scripts/install.sh` through `YUEKBOX_BASE_URL`. It covers
the happy path, a checksum mismatch, platform refusal, and the release URLs:

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
GPU, no Bun, and no checkout.

1. Install the latest release:

   ```sh
   curl -fsSL https://github.com/codenamegary/yuekbox/releases/latest/download/install.sh | sh
   ```

2. Confirm `~/.local/bin/yuekbox` exists and is executable. The installer
   printed no checksum error.
3. Set up the runtime: `yuekbox --provision`. Needs the NVIDIA driver and
   network access. It builds the one shared Python environment under `~/.yuekbox`.
4. Start the app: `yuekbox`. Open <http://127.0.0.1:3000>. `GET /v1/status`
   reports `ffmpeg` and `yue2`.
5. Pin a version with `YUEKBOX_VERSION=v0.3.0` and confirm the same result.
6. Move the install with `YUEKBOX_INSTALL_DIR=/tmp/yuekbox-bin` and confirm the
   binary lands there.
7. Serve a wrong checksum over a local mirror, point `YUEKBOX_BASE_URL` at it,
   and confirm the installer installs nothing and fails loudly.
