<!-- yuekbox-packaging -->
## Prebuilt binary

Every release ships `yuekbox-linux-x64`, a self-contained executable for
**Linux x86_64 and WSL2** with an NVIDIA GPU, plus its
`yuekbox-linux-x64.sha256` checksum. The installer verifies the checksum before
anything lands on the machine:

```sh
curl -fsSL https://github.com/codenamegary/yuekbox/releases/latest/download/install.sh | sh
yuekbox --provision
yuekbox
```

`YUEKBOX_VERSION=vX.Y.Z` pins a release and `YUEKBOX_INSTALL_DIR` moves the
install location (default `~/.local/bin`). macOS is not supported.

**The binary bundles** the web UI, the Fastify API, the SQLite schema and
migrations, and the Python helper scripts. It replaces a source checkout and a
`node_modules` tree.

**The binary does not bundle** CUDA, PyTorch, Python, ffmpeg, or model weights.
Those stay a machine prerequisite and a runtime download:

- an NVIDIA GPU with a driver at or above 525.60.13
- `ffmpeg` built with `libmp3lame`
- `yuekbox --provision` builds the pinned Python runtime under `~/.yuekbox`
  (network access and a few GB of disk)
- the five model directories come from the app's model downloads or an
  existing copy named in `~/.yuekbox/config.yaml`.

See the README for the full setup.
