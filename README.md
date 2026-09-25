<div align="center">

# 🌀 YUEKBOX 🌀

### Because apparently GPUs are musicians now.

A local, single-user web app that turns **a style + some lyrics** into a **full song** with [YuE2](https://github.com/multimodal-art-projection/YuE) running on your machine. Just you, a graphics card, and increasingly questionable lyrics.

![Yuekbox](docs/hero.png)

</div>

---

## ✨ WTF

I don't know man, nostalgia? Do you remember winamp? I do! Yuekbox harkens back
to those epic audio visualizer days, when you'd pop open ICQ and chat with somebody
half way around the world with your fire hazard of a lava lamp casting a dangerous glow
across your room, winamp blasting with some sick new visualizer on your CRT monitor
and Kazaa ripping viruses and REAL_NEW_EMINEM_FREE_NOT_FAKE.mp3 straight on to your
5400 RPM 10GB harddrive. So anyway I made this UI for Yue2, you type a vibe and some
words, hit the sparkle button, and watch the trip modes while a GPU in your house
lights on fire.

It is a **real app**, not a mockup. Under the AI skullduggery it's a Fastify server, a SQLite
queue, a worker, and the real YuE2 CLI. The visuals are just here to make the wait fun.

## 🎛️ What it does (v1)

- 🪞 **Two glass boxes.** One for style, one for lyrics, side by side.
- ✦ **Generate.** One click queues a Song and fires the worker.
- 🚦 **A queue, not a stampede.** Click generate ten times if you want. The GPU still runs one Song at a time.
- 📶 **Real progress.** Six stage pips, plus a hairline bar under them for the stages YuE2 actually counts (synthesize + decode). No fake bars for stages nobody can measure.
- 🔊 **Plays the MP3** when the Song lands, with a real spectrum fed by an `AnalyserNode`. The backdrop dances to it. Yes, really.
- ✍️ **Lyrics in the void.** While a Song plays, its lines fade in and out at the center of the page, timed to the notes actually sung in the rendered audio. Each line starts on its first note and stretches across held notes. Without a detection it falls back to the stored score. Each line settles in 0.4 s. The writer fades away until you pause.
- 🗂️ **History drawer.** Newest first. Click to play. Click to delete. Loading a song offers to replace the editor text before it stomps your draft.
- 🧪 **Keeps the score.** Every successful Song stores the ABC lead sheet for future features. v1 doesn't show it. Yet.
- ⌁ **Reference covers.** Attach a song file and SheetSage2 transcribes its melody first, then YuE2 sings your lyrics over that tune. Optional — without it you get the usual freeform generation.
- 🌈 **Four trip modes** for the background visualizer. More on that below.
- 🎨 **AI-authored backdrops.** With AI on, every new Song gets its own generated Canvas 2D visualization built from its style, its lyrics, and a randomly sampled visual direction, while the GPU is still working. It takes the backdrop over from the trip modes and owns the lyric display; reroll any Song whenever you like.
- 🧠 **Optional AI** that talks to any OpenAI-compatible endpoint — enhance, random, visualizations, full auto. Off by default. More below.

## 🖼️ Gallery

**Live progress**: pips light up per stage, and the bar tracks real step counts from YuE2's stderr.

![Generating](docs/generating.png)

**Playing**: the backdrop trips, the spectrum pulses, the scrubber obeys. Trip mode: Quantum Stardust Vortex.

![Playing](docs/playing.png)

**History**: every song, its status, its duration, one click away.

![History](docs/history.png)

**A considerate robot**: loading a song over a dirty editor asks first.

![Overwrite prompt](docs/overwrite-prompt.png)

**Reference covers**: attach a song file and SheetSage2 transcribes its melody before YuE2 sings your lyrics over it.

![Reference](docs/reference.png)

## 🚀 Quick start

You need:

- 🐧 **Linux x86_64 or WSL2** with an **NVIDIA GPU** (16 GB VRAM works with the default budget; 24 GB is YuE2's stated recommendation). macOS is not supported.
- 🎧 **ffmpeg** with `libmp3lame`
- 🧠 **The five model directories** — YuE2-3B, YuE2-Vae, SheetSage2, MERT-v2-FullSong, and Whisper large-v3-turbo. By default yuekbox looks for them under `~/.yuekbox/models/<name>`; `~/.yuekbox/config.yaml` (or a CLI flag) points anywhere else.
- 🐍 **Python 3.12** only for the manual venv route. `yuekbox --provision` installs its own.
- 🥟 **[Bun](https://bun.sh) 1.4+** only to run from source. The released binary needs no Bun and no checkout.

### 📥 Install a release (no Bun, no checkout)

Every release attaches the `yuekbox-linux-x64` binary, its `.sha256` checksum,
and this installer. One line, on Linux or WSL2:

```bash
curl -fsSL https://github.com/codenamegary/yuekbox/releases/latest/download/install.sh | sh
```

On WSL2, or if you want to read the script before running it, download it and
run it:

```bash
curl -fsSL https://github.com/codenamegary/yuekbox/releases/latest/download/install.sh -o install.sh
sh install.sh
```

The installer checks the platform, downloads the binary and its checksum,
verifies SHA-256, and puts `yuekbox` in `~/.local/bin` (it prints the `PATH`
line when that directory is not on it). `YUEKBOX_INSTALL_DIR` moves the target
and `YUEKBOX_VERSION=v0.3.0` pins a release. Then:

```bash
yuekbox --provision   # one time: builds the Python runtime under ~/.yuekbox
yuekbox               # starts the app on http://127.0.0.1:3000
```

The binary bundles the UI, the API, the SQLite schema, and the Python helper
scripts. It does **not** bundle CUDA, PyTorch, Python, ffmpeg, or the model
weights. `--provision` builds the Python runtime under `~/.yuekbox`, and the
models come from the app's downloader or from copies you already have.

### 🧰 Run from source

```bash
git clone https://github.com/codenamegary/yuekbox.git ui
cd ui
bun install
bun run dev
```

Open <http://127.0.0.1:3000> and go make something weird. The API hums along on
<http://127.0.0.1:8787>. Check its vitals with:

```bash
curl -s http://127.0.0.1:3000/v1/status
# {"version":"0.1.0","state":"online","ffmpeg":"ok","yue2":"ok",...}
```

### 📦 Single binary (no Bun or source tree at runtime)

The released `yuekbox-linux-x64` is this executable. CI builds it, smoke-tests
it, and attaches it to each GitHub release with its `.sha256` checksum. To build
the same file yourself:

```bash
bun run build:binary
./yuekbox
```

It serves the UI and the API on one port: <http://127.0.0.1:3000> (`WEB_PORT`
moves it). The first start extracts the Python helpers into
`~/.yuekbox/scripts`; `--home`, `--config`, `--yue2-model` and the other config
flags behave exactly as they do in dev. `--provision` is still the full setup
step (venvs and model checks) and installs the same helpers. The binary needs
no `node_modules`, no source tree, and no Bun.

Cross-compile with `--target` and a local runtime:

```bash
bun run build:binary yuekbox-musl \
  --target bun-linux-x64-musl \
  --executable ~/.bun/install/cache/@oven/bun-linux-x64-musl@1.4.2@@@1/bin/bun
```

linux-x64 is the ship target. macos-arm64 is not supported: yuekbox wants a
local NVIDIA GPU. `scripts/smoke-binary.sh ./yuekbox` runs the compiled
acceptance smoke test locally; CI runs it on every PR. `sh scripts/install.test.sh`
exercises the release installer against a local HTTP server, and
[`docs/releasing.md`](docs/releasing.md) covers the release workflow and the
clean-machine install test.

Yuekbox keeps everything it manages in `~/.yuekbox` (`--home` moves it): model defaults
under `models/`, the Python venvs under `venvs/`, our scripts under `scripts/`, and the
SQLite file plus Song media under `data/`. The only thing you configure is where the five
model files live:

```yaml
# ~/.yuekbox/config.yaml
models:
  yue2: /mnt/audio/YuE2-3B
  yue2Vae: /mnt/audio/YuE2-Vae
```

Keys you leave out fall back to `~/.yuekbox/models/<name>`. A CLI flag beats the file:
`bun src/server.ts --yue2-model /mnt/audio/YuE2-3B`. `YUE2_KIT` is gone; yuekbox never
asks about a checkout.

### 🎼 Reference covers (optional)

Reference covers need [SheetSage2](https://huggingface.co/m-a-p/SheetSage2) to turn your uploaded
audio into a melody. Without it the app works fine; a reference upload fails cleanly on the first
generate. Install it into yuekbox's home with Python 3.10 or 3.11:

```bash
python3.11 -m venv ~/.yuekbox/venvs/sheetsage2
~/.yuekbox/venvs/sheetsage2/bin/python -m pip install huggingface-hub==0.36.0
~/.yuekbox/venvs/sheetsage2/bin/huggingface-cli download m-a-p/SheetSage2 --local-dir ~/.yuekbox/models/SheetSage2
~/.yuekbox/venvs/sheetsage2/bin/python -m pip install torch==2.8.0 torchaudio==2.8.0 \
  --index-url https://download.pytorch.org/whl/cu126
~/.yuekbox/venvs/sheetsage2/bin/python -m pip install -r ~/.yuekbox/models/SheetSage2/requirements.txt
```

yuekbox runs the venv at `~/.yuekbox/venvs/sheetsage2` and our own
`~/.yuekbox/scripts/transcribe.py` (source: `packages/server/tools/sheetsage2/`, vendored
from YuE at the revision pinned in `packages/server/src/runtime/runtime.pins.ts`,
Apache-2.0). The script installer copies it into the home. The SheetSage2 and
MERT-v2-FullSong directories are configured with `models.sheetsage2` and
`models.sheetsage2Base` (defaults under `~/.yuekbox/models/`). `SHEETSAGE2_OFFLINE=0`
allows first-run downloads through the Hugging Face cache. Uploads are capped at 25 MB
(`REFERENCE_MAX_BYTES`).

## 🤖 The "just make it work" prompt

Don't feel like reading setup docs? Paste this into Claude Code, Cursor, or any agent
with shell access to the GPU machine. It sets up YuE2 and Yuekbox from scratch.

```text
Set up Yuekbox and its YuE2 backend on this machine. Yuekbox is a local web app
that generates songs on the local GPU. Work through the steps in order and verify
each before moving on. Ask before downloading model weights (several GB).

Assumptions
- Linux or WSL2 with an NVIDIA GPU visible to `nvidia-smi`.
- `git`, `curl`, and `ffmpeg` are installed. ffmpeg must include libmp3lame;
  check with `ffmpeg -hide_banner -encoders | grep mp3`.
- `python3.12` is available. If `bun` is missing, install it with
  `curl -fsSL https://bun.sh/install | bash`.

1) Make yuekbox's home and install the pinned YuE2 runtime
     mkdir -p ~/.yuekbox/models ~/.yuekbox/venvs ~/.yuekbox/scripts ~/.yuekbox/data
     python3.12 -m venv ~/.yuekbox/venvs/yue2
     . ~/.yuekbox/venvs/yue2/bin/activate
     python -m pip install --upgrade pip
     python -m pip install "yue2-infer @ git+https://github.com/multimodal-art-projection/YuE.git@bd90e4ccae671d869b3ecaca6d7e893927d29442"
   That commit is the runtime pin; `packages/server/src/runtime/runtime.pins.ts` in the
   yuekbox repo (cloned in step 3) is the source of truth, and it is not on PyPI. Do not
   install a checkout's HEAD.
   Verify: `~/.yuekbox/venvs/yue2/bin/yue2 doctor` reports `"dependencies_ready": true`.
   If the Hugging Face download later requires access, log in first with
   `~/.yuekbox/venvs/yue2/bin/hf auth login`.

2) Download the two model sets into the home (ask me first)
     ~/.yuekbox/venvs/yue2/bin/huggingface-cli download m-a-p/YuE2-3B --local-dir ~/.yuekbox/models/YuE2-3B
     ~/.yuekbox/venvs/yue2/bin/huggingface-cli download m-a-p/YuE2-Vae --local-dir ~/.yuekbox/models/YuE2-Vae
   Verify: ~/.yuekbox/models/YuE2-3B/config.json and ~/.yuekbox/models/YuE2-Vae/config.json exist.

3) Clone Yuekbox
     git clone https://github.com/codenamegary/yuekbox.git ui
   (Model locations come from ~/.yuekbox/config.yaml or CLI flags. If the models
   live elsewhere, write models.yue2 and models.yue2Vae there or pass
   --yue2-model/--yue2-vae. There is no YUE2_KIT to point at.)

4) Install and run
     cd ui
     bun install
     cp packages/server/tools/yue2/generate.py \
        packages/server/tools/sheetsage2/transcribe.py \
        packages/server/tools/sheetsage2/abc_tools.py \
        packages/server/tools/sheetsage2/common.py \
        packages/server/tools/lyric-align/align.py ~/.yuekbox/scripts/
     bun run dev
   The web app is at http://127.0.0.1:3000 and the API at http://127.0.0.1:8787.
   (That copy is what the script installer does; provisioning will run it for you.)

5) Verify end to end
     curl -s http://127.0.0.1:3000/v1/status
   Expect "ffmpeg":"ok" and "yue2":"ok". Then open http://127.0.0.1:3000, enter a
   style and lyrics, press the sparkle button, wait for the pips to finish, and
   confirm the player plays the MP3. Finally run `bun run check` and confirm it
   passes.

Notes
- The first generation after boot loads the model and takes a few minutes; later
  songs take roughly one to three minutes each.
- One Song runs on the GPU at a time; extra Generate clicks queue behind it.
- The server binds localhost only. Do not expose it.
- Do not commit anything. Report the /v1/status output, the song id, its
  duration, and any errors with stderr tails.
```

## 🧠 How it works

```text
packages/web        Bun.serve SPA + /v1 proxy, React 19, TanStack Query, Tailwind 4
packages/server     Fastify 5, Drizzle ORM, bun:sqlite, a single worker loop
packages/contracts  Zod wire schemas, paths, RFC 7807 problems
```

One worker claims the oldest `queued` Song, marks it `running`, and runs our
`~/.yuekbox/scripts/generate.py` with the YuE2 venv (the runtime that script drives is
pinned in `packages/server/src/runtime/runtime.pins.ts`). The runtime's stderr is parsed
live: known stage names move the pips, numeric lines move the progress bar. Success
means: encode the FLAC to MP3 with ffmpeg, transcribe the vocals with SheetSage2 to
calibrate the lyric timing, write the MP3, the ABC scores, and `calibration.json` into
the Song's own folder under `MEDIA_DIR`, mark it `complete`, nuke the temp dir. Failure
stores a short stderr tail and marks it `failed`. If the server dies mid-run, the next
boot confesses: `interrupted`.

Songs move through `queued → running → complete | failed`, and while running they carry
a `stage` (`plan`, `semantic`, `synthesize`, `decode`, `encode`, `sync`) plus `stageProgress`
when YuE2 gives us numbers. The web app polls, whoever is active updates fastest.

## 🧠 Bring your own model (optional)

AI is **off by default**, and the app behaves exactly as it always has until you
flip the switch in the settings sigil (⚙). Turn it on and Yuekbox talks to any
**OpenAI-compatible endpoint**: OpenAI, Anthropic, Gemini, OpenRouter, Groq,
Mistral, DeepSeek, Together — or whatever local thing you have running (Ollama,
LM Studio, vLLM). Pick a preset, adjust the base URL if you need to, add an API
key if the endpoint wants one, and choose a model from the endpoint's **live
`/models` listing**. Keys stay in the local SQLite file and are never echoed
back out of the API — only a `···abcd` hint.

With AI on, the boxes grow little sigils:

- **✧ enhance** on the style box sharpens the vibe you're pointing at.
- **✧ enhance** on the lyrics box extends and reworks what's there — or writes
  brand new lyrics when the box is empty.
- **⚄ random** has the model write a full new song and plays it.
- **∞ full auto** hides the inputs and runs the jukebox: always one song
  playing, always the next one generating. It never asks you anything.

Style, lyrics, and visuals each get their own endpoint, model, and optional
`reasoning_effort` (`off`, `low`, `medium`, `high` — only sent when not off).

The **visuals writer** authors one JavaScript canvas factory per Song, in parallel
with GPU generation. When it's configured, a selected Song with a visualization
hands the backdrop to it: the generated code gets the live audio spectrum and the
active lyric line and draw to a full-screen canvas. Reroll it from the player at
any time. If authoring fails — or the generated code throws — the trip mode
returns and a small badge offers a reroll; playback is never blocked.

## 🌌 The psychedelic bit

The whole visual layer is a port of the project's original redline mockup, and it is
deliberately, unapologetically **a screensaver that happens to make music**:

- 🌀 **Hyperspace Vortex** — Milkdrop-style concentric rings that breathe with the bass
- 〰️ **Phosphor Oscilloscope** — three ribbons of acid-green/violet waveform
- ❂ **Chromatic Plasma** — sixteen bands of hue-shifting interference
- ✧ **Quantum Stardust Vortex** — ninety particles orbiting a point that isn't there

**Contributions to this layer are extremely welcome.** Adding a fifth trip mode is
basically a one-function PR — see below. With AI on and the visuals writer
configured, a Song's own generated visualization takes the screen instead; the
trip modes are always the fallback.

## 🛠️ Contributing

Yuekbox is a fun project and contributions are **very** welcome. No contribution is
too small — a typo fix, a new trip mode, a bug report with a good screenshot, all of it counts.

### Ways to help

- 🌈 **Add a trip mode.** The background engine (`packages/web/src/songs/songs.winamp.engine.ts`) has one draw function per mode. Write a new one, add a sigil, done.
- 🎨 **Own the vibe.** Better typography, themes, a reduced-motion mode that keeps the soul but calms the visuals.
- 🐛 **Fix bugs.** Check the issues, or open one with the `/v1/status` output and a screenshot.
- 📝 **Write docs.** Especially real-world examples of styles/lyrics that work well.
- 🎼 **Future features.** ABC score viewing, covers via SheetSage2, chord edits — the data is already stored.

### The loop

1. 🍴 Fork and branch: `git checkout -b feat/my-thing`
2. 🥟 `bun install`
3. ✍️ Make the change
4. ✅ `bun run check` — lint, typecheck, tests. Keep it green.
5. 🚀 Open a PR. **Visual changes need visuals** — a screenshot or short clip. (The `docs/` stills were captured with a CDP-driven headed Chrome, if you want the same for yours.)

### House rules

- 🚫 No semicolons, no `any`, no classes, `const` only. oxlint + oxfmt enforce most of it; `bun run check` is the referee.
- 📦 Contracts first. New wire fields start in `packages/contracts`, never duplicated in the server.
- 🔌 Ports stay atomic. Use cases return `Result<T, E>` and never see Fastify or SQL.
- 🧪 Tests use inline stubs, not mocks. The GPU never runs in unit tests.
- 🎧 One Song on the GPU at a time. The queue is the feature.

### Reporting bugs

Include:

- the output of `curl -s http://127.0.0.1:8787/v1/status`
- what you expected vs. what happened
- if a generation failed: the Song id and its `errorDetail`
- if it's visual: a screenshot, and which trip mode you were in

### Etiquette

Be kind, assume good faith, and remember that this is a small app made for joy.
If a PR needs work, a maintainer will say so warmly and specifically.

## ⚙️ Home and config

yuekbox owns `~/.yuekbox` (override with `--home`):

```text
~/.yuekbox/
├── config.yaml           # the only user-editable file
├── models/<name>/        # the five model directories
├── venvs/<name>/         # python venvs: yue2, sheetsage2, lyricalign
├── scripts/              # generate.py, transcribe.py, abc_tools.py, common.py, align.py
└── data/                 # yuekbox.sqlite and per-Song media
```

The scripts are ours (source: `packages/server/tools/`). The script installer
(`packages/server/src/provisioning/`) copies them into `scripts/` flat and idempotently;
provisioning builds the venvs around the runtime pinned in
`packages/server/src/runtime/runtime.pins.ts`. The packaged binary embeds the same
five files and extracts them into `scripts/` on every start, so a fresh download
needs no copy step.

The only thing you configure is where the five model files live. `config.yaml` is optional
and partial; unset keys fall back to `~/.yuekbox/models/<name>`:

| Config key | Model |
| --- | --- |
| `models.yue2` | YuE2-3B |
| `models.yue2Vae` | YuE2-Vae |
| `models.sheetsage2` | SheetSage2 |
| `models.sheetsage2Base` | MERT-v2-FullSong |
| `models.whisper` | Whisper large-v3-turbo |

A CLI flag beats the file: `--yue2-model`, `--yue2-vae`, `--sheetsage2`,
`--sheetsage2-base`, `--whisper`, plus `--home` and `--config`. `GET /v1/config` returns the
effective paths and `PUT /v1/config` writes partial `{ "models": { ... } }` updates.

Server and runtime overrides (advanced; everything else under the home is internal):

| Name | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Fastify bind address |
| `PORT` | `8787` | Fastify port |
| `SQLITE_PATH` | `~/.yuekbox/data/yuekbox.sqlite` | SQLite file |
| `MEDIA_DIR` | `~/.yuekbox/data/media` | Per-Song folders: `<title>_<songId>/generated_<songId>.mp3`, `score.abc`, `reference_score.abc`, `references/<name>_<ulid>.<ext>`; uploads land in `temp/` |
| `FFMPEG_BIN` | `ffmpeg` | Encoder binary |
| `API_ORIGIN` | `http://127.0.0.1:8787` | Target the web `/v1` proxy forwards to |
| `WEB_HOST` | `127.0.0.1` | Bun web server bind address (dev and binary) |
| `WEB_PORT` | `3000` | Bun web server port |

In the packaged binary the API binds an OS-assigned loopback port, so `HOST` and
`PORT` apply to the dev server only; `WEB_HOST`/`WEB_PORT` are the public listener.

## 🧰 Scripts

| Command | Does |
| --- | --- |
| `bun run dev` | Fastify (:8787) and the web app (:3000) in parallel |
| `bun run check` | Lint, typecheck, and tests across all packages |
| `bun run test` | `bun test` per package |
| `bun run build:binary` | Compile the single `./yuekbox` executable |
| `sh scripts/install.test.sh` | Installer test against a throwaway HTTP server |
| `bash scripts/release-notes.test.sh` | Release-note append test with a `gh` shim |
| `bun run db:generate <name>` | Drizzle migration from the schema |
| `bun run format` / `format:check` | oxfmt |

## 🔌 API sketch

- `POST /v1/songs` — body `{ lyrics, style, seed? }`, returns `201` and the Song.
- `GET /v1/songs` — newest first, keyset cursor, optional repeated `status`.
- `GET /v1/songs/:songId` — one Song.
- `GET /v1/songs/:songId/audio` — `audio/mpeg` with Range support; `409` before completion.
- `DELETE /v1/songs/:songId` — `204`.
- `GET /v1/status` — version, state, `ffmpeg`, `yue2`, `queueDepth`, `gpuBusy`.
- `GET` / `PUT /v1/config` — the five model paths; `PUT` writes `~/.yuekbox/config.yaml`.
- `GET /v1/ai/presets` — known OpenAI-compatible endpoints and icons.
- `GET` / `PUT /v1/ai/config` — AI settings; API keys are write-only.
- `GET /v1/ai/models?scope=style|lyrics` — live model list from that endpoint.
- `POST /v1/ai/enhance` — `{ kind, style?, lyrics? }` → `{ text }`.
- `POST /v1/ai/songs/random` — the model writes a Song, the queue runs it.

## 📜 License

Yuekbox is released under the [MIT License](LICENSE). Take it, fork it, remix it, ship it.

YuE2 model weights and the Python runtime are separate projects and are **not** covered by
this license; they carry their own from the
[YuE project](https://github.com/multimodal-art-projection/YuE).

---

<div align="center">

Made for headphones, late nights, and GPUs that deserve better than spreadsheets. 🎧🌙

**Go make something weird.**

</div>
