<!-- yuekbox-packaging -->
## Install

```sh
npm i -g yuekbox
yuekbox
```

Or take it for one spin without installing:

```sh
npx yuekbox
```

**Each package bundles** the web UI, the Fastify API, the SQLite schema and
migrations, and the Python helper scripts. It runs on [Bun](https://bun.sh)
1.4.2+ and replaces a source checkout and a `node_modules` tree.

**The package does not bundle** CUDA, PyTorch, Python, ffmpeg, or model
weights. Those stay a machine prerequisite and a runtime download:

- Linux or WSL2: an NVIDIA GPU with a driver at or above 525.60.13; macOS:
  Apple Silicon with macOS 14.2+ and 16 GB of unified memory
- [Bun](https://bun.sh) 1.4.2 or newer on your `PATH`
- `ffmpeg` (with `libmp3lame`; `brew install ffmpeg` on macOS)
- `yuekbox --provision` builds the pinned Python runtime under `~/.yuekbox`
  (network access and a few GB of disk). macOS builds two environments: the
  Torch-free MLX runtime that generates songs and transcribes references on
  the GPU, and a torch environment for lyric timing.
- the five model directories come from the app's model downloads or an
  existing copy named in `~/.yuekbox/config.yaml`. Each platform downloads
  the revisions its runtime verifies; the folders are the same names.

See the README for the full setup.
