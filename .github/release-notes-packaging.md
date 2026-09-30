<!-- yuekbox-packaging -->
## Prebuilt binaries

Every release ships `yuekbox-linux-x64` for **Linux x86_64 and WSL2** with an
NVIDIA GPU, and `yuekbox-darwin-arm64` for **macOS on Apple Silicon** (M1 or
newer, macOS 14.2+, 16 GB unified memory minimum), each with its
`.sha256` checksum. The installer verifies the checksum, picks the right
asset for the machine, and installs before anything lands:

```sh
curl -fsSL https://github.com/codenamegary/yuekbox/releases/latest/download/install.sh | sh
yuekbox --provision
yuekbox
```

`YUEKBOX_VERSION=vX.Y.Z` pins a release and `YUEKBOX_INSTALL_DIR` moves the
install location (default `~/.local/bin`). An Intel Mac is not supported: the
Apple Silicon runtime needs an M1 or newer.

**Each binary bundles** the web UI, the Fastify API, the SQLite schema and
migrations, and the Python helper scripts. It replaces a source checkout and a
`node_modules` tree.

**The binaries do not bundle** CUDA, PyTorch, Python, ffmpeg, or model weights.
Those stay a machine prerequisite and a runtime download:

- Linux: an NVIDIA GPU with a driver at or above 525.60.13; macOS: Apple
  Silicon with macOS 14.2+ and 16 GB of unified memory
- `ffmpeg` (with `libmp3lame`; `brew install ffmpeg` on macOS)
- `yuekbox --provision` builds the pinned Python runtime under `~/.yuekbox`
  (network access and a few GB of disk). macOS builds two environments: the
  Torch-free MLX runtime that generates songs and transcribes references on
  the GPU, and a torch environment for lyric timing.
- the five model directories come from the app's model downloads or an
  existing copy named in `~/.yuekbox/config.yaml`. Each platform downloads
  the revisions its runtime verifies; the folders are the same names.

See the README for the full setup.
