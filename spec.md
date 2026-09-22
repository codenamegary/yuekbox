# Yuekbox spec

Local web app. User types lyrics and a style, hits Generate, and hears a song.

This is v1 plus reference covers. Later score editing and agent edits stay out of the product surface. Every successful Song keeps its ABC score on disk so those features can turn on later without a new generator.

## Language

**Song**:
One generate request and its result. Has lyrics, style, title, status, and optional MP3 audio.
_Avoid_: Track, generation, job, run, render (in the UI and on the wire)

**Request**:
The lyrics and style the user submitted, and the title derived from the first sung line. Stored on the Song.
_Avoid_: Prompt, prompt JSON (except when talking to the YuE2 CLI)

**Score**:
ABC lead sheet YuE2 wrote for the Song. Stored as `score.abc` in the Song's folder. Hidden in v1.
_Avoid_: Plan, MIDI, sheet

**Calibration**:
The sung lines Whisper heard in the rendered audio, with their times, stored as
`calibration.json` in the Song's folder. The overlay shows them as-is; without a
calibration the web app falls back to the Score's vocal melody.
_Avoid_: Alignment, sync data

**Queue**:
Ordered Songs waiting for the GPU. Length may be greater than 1. The GPU runs one Song at a time.
_Avoid_: Batch

**Worker**:
Process-side loop that claims the next queued Song, runs YuE2, encodes MP3, and writes the result.
_Avoid_: Job runner, daemon (in domain talk)

**Reference**:
Optional audio the user uploads with a Song. SheetSage2 transcribes it to a melody-only ABC, and the Song generates against that melody with `cot = melody`.
_Avoid_: Sample, source track, input audio

**Cover**:
A Song generated from a Reference instead of the symbolic planner.
_Avoid_: Remix, transfer

Status values: `queued`, `running`, `complete`, `failed`.

Stage values while `running`: `transcribe`, `plan`, `semantic`, `synthesize`, `decode`, `encode`, `sync`. Omit `stage` when not running. Covers start at `transcribe`; freeform Songs start at `plan`. `sync` runs last, after the MP3 encode, and writes the lyric calibration.

## Goal

v1 does this and nothing else:

1. User enters style and lyrics.
2. User may attach a Reference audio file.
3. User hits Generate.
4. UI shows progress.
5. UI plays the MP3 when the Song is complete.
6. UI lists earlier Songs and plays them.

No login. Single user on this machine.

## Non-goals (v1)

- ABC editor, piano roll, or score display
- ASR or source-separation controls in the UI
- Reference playback in the UI (the upload only feeds transcription)
- `cot` picker (`full` only)
- CFG, sampling, VAE picker
- Concurrent GPU generates
- Multi-user auth
- Storing FLAC, semantic tokens, or latents
- Inpainting or "keep this chorus"
- ComfyUI

## Repo shape

Existing Bun workspaces under `ui/`:

```text
ui/
├── package.json              # workspace root, catalog, scripts
├── spec.md
├── .oxlintrc.json
├── .oxfmtrc.json
├── packages/
│   ├── contracts/            # Zod wire schemas and paths
│   ├── server/               # Fastify API, SQLite, worker
│   └── web/                  # React SPA
```

Package names already in `package.json`: `codenamegary/yuekbox-contracts`, `codenamegary/yuekbox-server`, `codenamegary/yuekbox-web`. Import the contracts package as `contracts` via workspace name `contracts` (set `"name": "contracts"` like agent-server, or keep the scoped name and import that). Prefer the short workspace name `contracts` / `server` / `web` to match agent-server.

Root `package.json` is a real Bun workspace root. One lockfile at `ui/bun.lock`. Drop per-package leftover `bun.lock` and Bun init `index.ts` hello files.

Workspace catalog pins shared versions (zod, drizzle-orm, typescript, fastify, oxlint). Confirm latest stable on npm at install time. Caret ranges on current majors.

Scripts at the root, same idea as agent-server:

```text
dev            bun run --filter '*' dev
lint           bun run --filter '*' lint
typecheck      bun run --filter '*' typecheck
test           bun run --filter '*' test
format         oxfmt
format:check   oxfmt --check
check          lint && typecheck && test
db:generate    bun run --filter server db:generate
```

`packages/web` does not host the API. Fastify is the only HTTP API. Drop the Bun `serve({ routes: { "/api/hello" } })` demo routes.

`packages/web` is a React SPA served by Bun. Keep `bun-plugin-tailwind` and the HTML entry (`src/index.html` plus a client `main.tsx`). `src/serve.ts` is the Bun.serve process. It serves the SPA and reverse-proxies `/v1` to Fastify. No Vite.

## TypeScript rules

Apply typescript-dev and typescript-dev-backend everywhere.

- No semicolons. oxfmt enforces this.
- No `any`. No classes. No `interface` (except `.d.ts` merging).
- No barrel `index.ts` files.
- No `import type`. Ordinary imports.
- `const` only. No `let`.
- Curried `make<Action>(deps)(input)` on the server.
- Atomic function ports. No repository objects.
- Use cases return `Result<T, E>`. No Fastify or SQL inside use cases.
- Direct imports from defining modules.
- Server filenames: `songs.create.usecase.ts` (lowercase, dots).
- React components: PascalCase `.tsx`, named `const` with `React.FC`. No default export except `drizzle.config.ts`.

## Lint and format

Copy the agent-server oxlint and oxfmt setup.

Root `.oxlintrc.json`:

- `typeAware: true`
- Plugins: typescript, oxc, unicorn, import, react
- `typescript/consistent-type-imports`: prefer `no-type-imports`
- `typescript/consistent-type-definitions`: `type`
- `typescript/no-explicit-any`: error
- `max-classes-per-file`: 0
- `oxc/no-barrel-file` threshold 0
- `import/no-default-export`: error
- `react/function-component-definition`: arrow functions
- `unicorn/filename-case`: lowercase for `*.ts`, PascalCase for `*.tsx`
- `prefer-const`, `no-var`
- `no-param-reassign` with `props: true` on `*.{ts,tsx}`
- Overrides: `.d.ts` may use `interface`. `drizzle.config.ts` may default-export. `main.tsx` and `*.test.tsx` stay lowercase filenames.

Each workspace has `.oxlintrc.json` that extends the root. Web adds `react/rules-of-hooks`.

Lint command: `oxlint --deny-warnings`.

Install `oxlint-tsgolint` at the root for type-aware rules.

Root `.oxfmtrc.json`:

```json
{
  "semi": false,
  "printWidth": 100,
  "tabWidth": 2,
  "singleQuote": false,
  "trailingComma": "all",
  "sortPackageJson": false
}
```

`lint-staged` runs `oxfmt` on every staged file, same as agent-server.

## API standards

Richardson Level 2. Match agent-server wire habits.

| Axis | Choice |
|---|---|
| Prefix | `/v1/` |
| Paths | Plural nouns, kebab-case segments |
| JSON | camelCase |
| Query names | camelCase |
| Arrays | Repeated keys (`?status=a&status=b`) |
| Dates | ISO 8601 UTC strings |
| Errors | RFC 7807 Problem Details, `application/problem+json` |
| Collections | `{ items, page }` with `limit`, `nextCursor`, `previousCursor`, `count` |
| IDs | ULID strings |
| Create | `201` plus `Location: /v1/songs/{id}` |
| Delete | `204` |

Problem `type` URLs live under `https://yuekbox.local/problems/`. Start with `validation-error`, `internal-error`, `not-found`, `conflict`.

Contracts own paths as constants next to the Zod schemas. Example: `songsPath = "/v1/songs"`.

No `{ data: ... }` wrapper. Song JSON never includes MP3 bytes.

## Contracts package

`packages/contracts/src/http/`. Subpath exports, no barrel.

```text
./http/primitives
./http/error
./http/collection
./http/status
./http/songs
```

Schemas (Zod 4, `z.strictObject`, `z.infer` for types):

**POST /v1/songs** body:

```text
lyrics   string, trim, min 1, max 20000
style    string, trim, min 1, max 2000
seed     optional integer, 0 <= seed < 2^31
```

Server fills `cot: "full"` and a random `seed` when omitted. Those fields are not in the create body.

**Song** (JSON):

```text
id                string
status            queued | running | complete | failed
stage             plan | semantic | synthesize | decode | encode | sync   (only when running)
lyrics            string
style             string
title             string
seed              number
durationSeconds   number | omitted until complete
truncated         { abc: boolean, semantic: boolean } | omitted until complete
scoreAbc          string | omitted unless complete; only sent by GET one Song
calibration       { cues: [{ text, startSeconds, endSeconds }] } | omitted unless complete; only sent by GET one Song
errorDetail       string | omitted unless failed
createdAt         iso datetime
updatedAt         iso datetime
completedAt       iso datetime | omitted until complete or failed
```

**GET /v1/songs** query: `limit` (default 20, max 100), `cursor`, optional repeated `status`.

**GET /v1/songs/:songId/audio**: raw `audio/mpeg`. Not JSON. `404` when the Song is missing. `409` with conflict problem when status is not `complete`.

**GET /v1/status**:

```text
version     string
state       starting | online | shutting_down
ffmpeg      ok | missing
yue2        ok | missing
queueDepth  number
gpuBusy     boolean
startedAt   iso datetime
```

Contracts tests parse fixtures with the schemas. No network.

## Server

Fastify 5. Bun. Drizzle ORM. `bun:sqlite`.

Layout:

```text
packages/server/src/
├── app.ts
├── server.ts                 # env, real vendor adapters, boot recovery, listen, signals
├── compose.ts                # media -> songs -> generation -> app wiring
├── db/
│   ├── client.ts
│   └── migrations/
├── media/                    # pure file store; depends on nothing
│   ├── media.ports.ts
│   ├── media.adapters.ts
│   └── media.assembly.ts
├── generation/               # worker and vendor adapters; depends on songs
│   ├── generation.models.ts
│   ├── generation.ports.ts
│   ├── generation.assembly.ts
│   ├── generation.worker.ts
│   ├── generation.yue2.adapters.ts
│   ├── generation.ffmpeg.adapters.ts
│   └── generation.sheetsage2.adapters.ts
├── shared/
│   └── result.ts
├── songs/                    # lifecycle, routes, naming; depends on media
│   ├── songs.models.ts
│   ├── songs.ports.ts
│   ├── songs.files.ts        # pure key building, folder matching, display parsing
│   ├── songs.create.usecase.ts
│   ├── songs.list.usecase.ts
│   ├── songs.get.usecase.ts
│   ├── songs.delete.usecase.ts
│   ├── songs.complete.usecase.ts
│   ├── songs.audio.usecase.ts
│   ├── songs.reference.score.usecase.ts
│   ├── references.usecase.ts
│   ├── songs.sqlite.adapters.ts
│   ├── songs.routes.ts
│   ├── references.routes.ts
│   └── songs.assembly.ts
└── visualizations/           # AI-authored visuals; uses songs files and AI writers
    ├── visualizations.models.ts
    ├── visualizations.ports.ts
    ├── visualizations.checksum.ts
    ├── visualizations.authoring.ts   # in-memory pending/failed state
    ├── visualizations.get.usecase.ts
    ├── visualizations.request.usecase.ts
    ├── visualizations.routes.ts
    └── visualizations.assembly.ts
```

`server.ts` loads env, builds the real vendor adapters, calls `composeServer`, runs boot recovery, listens, and handles SIGTERM. `compose.ts` builds media, then songs, then generation, then the app and the AI slice; the process-root wiring test calls the same function.

Use cases are single-shot. The worker loop lives in `generation.worker.ts`. Routes enqueue then return. The worker claims work.

### Slices and dependency direction

One direction only: `media` depends on nothing, `songs` depends on media, `generation` depends on songs, and `visualizations` depends on songs and on the AI writers it is handed. Nothing under `songs/` imports anything under `generation/` or `visualizations/`. The edges are wired in `compose.ts`.

- `media` is a pure file store over opaque keys. No tables, no domain rules.
- `songs` owns the lifecycle table, the `/v1/songs` and `/v1/references` routes, file naming and folder discovery, upload to `temp/`, the reference move at create time, audio streaming, `visualization.js` reads and writes, and folder removal on delete. It exposes route-facing methods plus the capabilities record the worker consumes.
- `generation` owns the worker loop plus the yue2, ffmpeg, and sheetsage2 adapters. It reaches songs only through the capabilities record.
- `ai` owns the writer config, prompts, model calls, and validation for style, lyrics, and visuals. It never touches songs directly; compose hands it `createSong` and wires its visual authoring into the visualizations slice.
- `visualizations` owns the `/v1/songs/:id/visualization` routes, the in-memory per-Song pending/failed state, single-flight rerolls, and the author flow. The file on disk is the durable record; there is no table and no boot recovery.
- `wake` (`() => void`) starts the worker. `compose.ts` passes it to the songs POST route and the AI slice. `/v1/status` reads queue depth from songs and `isBusy` from the generation worker.

### Ports

Media is a set of atomic ports:

```text
MakeDirectory
PutFile
StatFile
ReadFile
OpenFileRange
MoveFile
RemoveFile
RemoveDirectory
FindFiles
```

`FindFiles` is a glob over `/`-separated segments with `*` per segment. There is no `**`, and `..` is rejected. Songs uses it to find a folder (`*_<songId>`), a reference file (`<folder>/references/*`), and an upload (`temp/*_<referenceId>.*`). `StatFile` returns `{ path, byteLength }`; it is the only port that hands out a real path, because the transcribe adapter shells out to Python with it. Everything else stays keyed.

Songs exposes these capabilities to generation:

```text
ClaimNextQueuedSong
MarkSongRunning
MarkSongStage
MarkSongProgress
MarkSongFailed
FindReferenceBySongId
SaveReferenceScore
CompleteSong
```

Generation's own ports:

```text
RunYue2Generate
RunTranscribe
RunLyricAlign
EncodeFlacToMp3
CreateTempDir
RemoveTempDir
```

`RunYue2Generate` takes `{ lyrics, style, seed, cot, abc, outputDir, onStage, onProgress }` and returns `{ flacPath, scoreAbc, durationSeconds, truncated, stages }` or a Result error. The adapter shells out to the YuE2 venv. It does not import Python.

`RunLyricAlign` takes `{ audioPath, outputDir }` and returns the calibration, or a Result error. The adapter runs `packages/server/tools/lyric-align/align.py` (Demucs vocal stem, Whisper word timings, silence gate, display-line grouping) and reads back the `calibration.json` it writes under the output dir.

`EncodeFlacToMp3` takes a FLAC path and returns MP3 `Uint8Array`.

`CompleteSong` writes `generated_<SONG_ID>.mp3` and `score.abc` into the folder, plus `calibration.json` when the input carries cues, then marks the row complete. If the row update fails it removes those files and rethrows.

### SQLite

WAL mode. Busy timeout set. File path from env, default `packages/server/data/yuekbox.sqlite`.

One table holds lifecycle state. Media lives on disk, so list queries never touch it:

**songs**

```text
id                 text pk
status             text not null
stage              text null
stage_completed    integer null
stage_total        integer null
lyrics             text not null
style              text not null
title              text not null
seed               integer not null
cot                text not null default 'full'
duration_seconds   real null
truncated_abc      integer null
truncated_semantic integer null
error_detail       text null
created_at         text not null
updated_at         text not null
completed_at       text null
```

`ai_config` is unchanged. There is no `song_audio` table, no `references` table, and no `score_abc` column. Visualizations store no row at all: the file is the durable state, and pending/failed live in process memory. Schema history is a fresh `0000_init` plus `0001_song_title`, which recreates `songs` to add the column and backfills rows that predate it as `untitled`. There is no other legacy read path.

### Disk layout

```text
<MEDIA_DIR>/<TITLE>_<SONG_ID>/
  generated_<SONG_ID>.mp3
  score.abc
  calibration.json                      optional
  reference_score.abc
  visualization.js
  references/<uploaded>_<ulid>.<ext>    optional
<MEDIA_DIR>/temp/<uploaded>_<ulid>.<ext>
```

- `TITLE` is the Song's stored title: the first sung lyric line with section tags, markdown decoration, and label-only lines skipped, 120 chars max, `untitled` when nothing is left. The folder uses its slug: lowercased, hyphenated, 60 chars max.
- A Song folder is found by scanning for `*_<song_id>`. No path is stored anywhere.
- The folder is created at create time, so even a freeform Song owns one from birth.
- Uploads land in `temp/`. Creating a Song with a `referenceId` moves the file into the Song's `references/` directory. Nothing is renamed after that.
- The uploaded name keeps its case, spaces, and unicode; path separators and control characters become `-`, the stem is capped at 120 chars, and the extension comes from the content type. The trailing `_<ulid>` is the Reference id; display names strip it (and add back the extension).
- `reference_score.abc` is written right after transcription. `score.abc` and `calibration.json` are written at completion. `calibration.json` exists only when the transcript produced cues. `visualization.js` holds one model-authored canvas factory; the visualizations slice writes it with the same temp + rename rule and reads it back for `GET /v1/songs/:id/visualization`. Deleting the Song deletes it with the folder. Nothing stores a path.

There is no purge job, no boot reconcile, and no rename step. Missing files surface lazily: the audio route stats the file and 404s, transcription fails before the script spawns, and `GET /v1/songs/:id` omits `scoreAbc` or `calibration` when the file is gone.

Writes go to `<path>.tmp`, then rename onto the final path. Deletes remove the row and the folder in parallel; either side tolerating a failure is fine, an orphan folder is harmless and a later read just reports the file as missing.

On process start, one recovery runs: any row with `status = running` becomes `failed` with `errorDetail = "interrupted"`. The GPU job does not resume.

### Visualizations

Each Song may own one AI-authored canvas visualization.

- Trigger: `createSong` fires `onSongQueued` once the row and folder exist. Compose wires it to the visualizations slice, which guards the visuals writer and starts one authoring run. AI off or the writer unconfigured is a silent no-op: no state, no file, no error on the Song.
- Authoring runs in parallel with the GPU worker and never touches the Song's status, stage, or progress.
- The prompt in `ai.visualization.prompts.ts` carries the host contract, a worked example, a randomly sampled DIRECTION (one value per axis: subject, motion, composition, marks, palette, lyric, event), the rules, the style, and the lyrics. Every authoring call samples a fresh direction, so consecutive Songs do not share a whole approach. The reply is cleaned of fences and unwrapped from the shapes models actually send (`const factory = (host) => {...}`, `export default`, named functions, prose around a fenced block) back to a bare expression, then smoke-run against a stub canvas with DOM/timer/network globals shadowed to undefined. A reply that cannot be normalized, or that throws while drawing, is discarded and asked again, up to 5 attempts with no backoff; the failure detail says why. There is no token scan and no size cap.
- `GET /v1/songs/:id/visualization` → `{ status, code?, checksum?, errorDetail? }` or 404. `ready` and `rerolling` carry the file's code and its SHA-256; `pending` means no file and a run in flight; `failed` means no file and the last run failed. The file wins whenever it exists: a failed reroll leaves the old visual playing with no error surfaced.
- `POST /v1/songs/:id/visualization` rerolls: 202 empty, 404 unknown Song, 409 when the visuals writer is not ready. A run already in flight absorbs the request.
- Restart mid-authoring drops the run. The Song has no visual until rerolled; nothing re-kicks and no failed badge survives. A browser-side compile or render failure shows the same badge, falls back to the trip mode, and clears on reroll.

### Generate path

1. `POST /v1/songs` validates body, derives the title from the first sung lyric line, inserts `queued`, creates the Song folder, returns `201` and the Song JSON.
2. Route calls `wake()`.
3. Worker claims the oldest queued Song, sets `running` and `stage = plan`.
4. Adapter writes a temp request JSON and runs:

```text
<yue2-python> -m yue2 generate
  --request <tmp>/request.json
  --output <tmp>/out
  --model <YUE2_KIT>/models/YuE2-3B
  --vae <YUE2_KIT>/models/YuE2-Vae
  --budget <YUE2_GPU_BUDGET>
  --offline
  --device cuda
```

CLI flags must match the installed `yue2` parser. If the module form fails, call the venv `yue2` script with the same flags.

5. Worker updates `stage` when stderr progress names a known stage. If parsing fails, leave the stage until done. Status stays `running`.
6. If the Song has a Reference, transcribe it before generation. Run `<sheetsage2-python> <kit>/skills/yue2-music/scripts/transcribe.py <MEDIA_DIR>/<TITLE>_<SONG_ID>/references/<name>_<ulid>.<ext> --output <tmp>/transcribe --task melody-full --device cuda --model <SHEETSAGE2_MODEL> [--base-model <SHEETSAGE2_BASE_MODEL>] [--offline]`, read `score.abc`, write it to `reference_score.abc` in the Song folder, then generate with `cot = melody` and the ABC in the request JSON. A missing Reference file fails the Song before the script spawns; any other failure fails the Song.
7. On success, read `audio.flac`. Encode MP3. Run the lyric aligner with `<LYRIC_ALIGN_PYTHON> <LYRIC_ALIGN_SCRIPT> --audio <FLAC> --out <tmp>/lyric-align --calibration-out <tmp>/lyric-align/calibration.json --device <LYRIC_ALIGN_DEVICE>`, read the `calibration.json` it writes, and pass the cues to `CompleteSong`, which writes `calibration.json` in the Song folder. The overlay shows the transcript as sung. A failed or empty run logs and leaves the Song without a calibration; the Song still completes. `CompleteSong` writes `generated_<SONG_ID>.mp3` and `score.abc` into the Song folder and marks the row `complete` with `durationSeconds` and the truncation flags. Delete the temp dir (FLAC does not stay on disk).
8. On failure, mark `failed`, store a short `errorDetail`, delete the temp dir.
9. Claim the next queued Song.

One Worker in the process. Claim uses a SQLite transaction so two loops cannot double-run.

### ffmpeg encode

Require a system `ffmpeg` built with `libmp3lame`. Check at boot (`ffmpeg -hide_banner -encoders`).

```text
ffmpeg -y -i <audio.flac> -codec:a libmp3lame -qscale:a 2 <song.mp3>
```

VBR quality 2. Stereo. Sample rate follows the source (48 kHz from YuE2). Do not resample unless lame rejects the rate.

Do not shell-interpolate paths. Pass args as an argv array.

If ffmpeg exits non-zero, the Song is `failed`. Do not store a partial blob.

### Env

```text
HOST                    default 127.0.0.1
PORT                    default 8787
SQLITE_PATH             default ./data/yuekbox.sqlite
MEDIA_DIR               default ./data/media
YUE2_KIT                default ../../ (repo root that holds models/ and .venv)
YUE2_PYTHON             default $YUE2_KIT/.venv/bin/python
YUE2_GPU_BUDGET         default 16
FFMPEG_BIN              default ffmpeg
SHEETSAGE2_PYTHON       default $YUE2_KIT/.venv-sheetsage2/bin/python
SHEETSAGE2_SCRIPT       default $YUE2_KIT/skills/yue2-music/scripts/transcribe.py
SHEETSAGE2_MODEL        default $YUE2_KIT/models/SheetSage2
SHEETSAGE2_BASE_MODEL   default <YUE2_KIT>/models/MERT-v2-FullSong when that folder exists, else unset (let the snapshot resolve its MERT-v2 parent)
SHEETSAGE2_DEVICE       default cuda
SHEETSAGE2_OFFLINE      default 1; set 0 to allow the Hugging Face cache to resolve
LYRIC_ALIGN_PYTHON      default $YUE2_KIT/.venv-lyricalign/bin/python
LYRIC_ALIGN_SCRIPT      default <repo>/packages/server/tools/lyric-align/align.py
LYRIC_ALIGN_DEVICE      default cuda:0
REFERENCE_MAX_BYTES     default 26214400 (25 MiB)
```

Bind localhost by default. This app talks to a local GPU.

### Tests

bun:test. Zero mocks. Inline stub ports.

Cover at least:

- Create returns a queued Song and does not call YuE2 (route/worker boundary).
- Create writes the Song folder, moves an upload into `references/`, and rolls back the row and folder when the move fails.
- Create rejects a missing upload with `reference_unavailable` on `/referenceId`.
- Create rejects empty lyrics and empty style.
- Get missing id is not-found; Get fills `scoreAbc`, the calibration, and the reference summary from disk.
- List does not include media or per-item disk reads.
- Complete path with stub `RunYue2Generate` + stub `EncodeFlacToMp3` writes `generated_<ID>.mp3`, `score.abc`, and `calibration.json` when cues arrive, then marks `complete`.
- A failed row update after completion removes the files it just wrote.
- A failed lyric alignment logs, completes the Song, and writes no calibration.
- Encode failure marks `failed` and writes nothing.
- `songs.files.ts` slugs the first lyric line, builds every key, and parses folder and reference names back to their ids.
- `media.find` matches segments, returns files and directories, and rejects `..`.
- `GET /v1/songs/:id/audio` serves a range from a multi-megabyte file in the folder, 416s an unsatisfiable range, and 404s when the file is gone.
- Transcribe points the script at the stored path and fails before spawning when the file is missing.
- Lyric align parses the calibration, rejects an empty or contract-breaking one, and fails before spawning when the environment or audio is missing.
- Deleting a Song removes the row and the folder; a folder failure is logged, not fatal.
- Creating a Song fires the queued hook after the row and folder exist, and not when validation fails.
- `visualization.js` round-trips through the songs slice; writing without a folder throws instead of dropping the code.
- Visualization routes: 404 for unknown Songs, 409 when the visuals writer is not ready, pending → ready with code and checksum, a second POST during a run starts nothing, a reroll reports `rerolling` with the old code until the checksum changes, and a failure shows `failed` until a reroll clears it.
- The authoring state machine writes the code, records upstream failures and write failures with details, absorbs a second start while in flight, and clears a failure on reroll.
- The prompt names the host contract and samples a different direction on every call; the author use case strips fences, unwraps assigned or declared factories, retries replies that do not produce a runnable function (including a missing-helper throw caught by the stub-canvas smoke run) and upstream or empty replies up to 5 times, and uses the visuals writer's model.
- The visualizations slice reports the failure detail through `GET`, and `SongPlayer` shows it beside the badge so a failed reroll says why.
- Wiring: compose creates a Song with AI configured, the visualization lands in the Song folder while the Song is still queued, and delete takes the file with the folder.
- Claim skips `running` and `complete`.
- Boot recovery: `running` becomes `failed`.
- One process-root wiring test: in-memory database, temp `MEDIA_DIR`, stubbed vendor ports, driving upload, create, complete, ranged stream, and delete through the real `composeServer`.

Fixture helpers in `songs/songs.fixtures.ts` build song rows, a capabilities stub, and files under a temp `MEDIA_DIR`.

No GPU in unit tests. No real ffmpeg in unit tests.

## Web

React 19. Tailwind CSS 4. Bun HTML serving. `bun-plugin-tailwind`. shadcn/ui New York, css variables, lucide icons (already in `components.json`).

Replace `class-variance-authority` with `tailwind-variants`. Variant helpers use `tv()`. Keep `cn()` as `twMerge(clsx(...))` for class composition. Do not add new CVA usage.

shadcn primitives live in `src/components/ui/`. App screens live in feature folders, not in `ui/`.

`src/serve.ts` calls `Bun.serve`. It mounts `src/index.html` for `/*`. For `/v1/*` it `fetch`es the Fastify origin (`http://127.0.0.1:8787` by default) and returns that response, including `audio/mpeg`. Do not reimplement Song routes in web.

`dev` is `bun --hot src/serve.ts`. Production build stays `build.ts` plus `bun src/serve.ts` against `dist`. Name the HTML server `serve.ts`, not `index.ts`, so oxlint barrel rules stay clean.

```text
packages/web/src/
├── serve.ts                # Bun.serve: SPA + /v1 proxy
├── index.html
├── main.tsx                # client mount (replaces frontend.tsx)
├── App.tsx
├── queryKeys.ts
├── lib/cn.ts
├── components/ui/          # shadcn
└── songs/
    ├── SongsPage.tsx
    ├── SongForm.tsx
    ├── SongPlayer.tsx
    ├── SongList.tsx
    ├── VisualizationCanvas.tsx
    ├── LyricOverlay.tsx
    ├── WinampCanvas.tsx
    ├── songs.api.ts
    ├── songs.queries.ts
    ├── songs.mutations.ts
    ├── songs.lyrics.timing.ts
    └── songs.visualization.ts
```

Remote state: TanStack Query only. Parse every response with contract schemas inside `queryFn`. Query keys in `queryKeys.ts`.

While a Song is `queued` or `running`, the Song query refetches on an interval (1s). Stop polling when `complete` or `failed`.

Local form fields: `useState` in `SongForm`. No Jotai unless a second distant tree needs the same draft.

### Screen

One page.

- Style field (textarea). Placeholder names genre, voice, instruments, tempo.
- Lyrics field (textarea). Placeholder shows `[Verse]` / `[Chorus]` lines.
- Generate button. Submits `POST /v1/songs`. Stays enabled so the user can queue another Song. Show queue depth from `/v1/status`.
- Active Song card: status, stage label, error text.
- Player: native `<audio controls src="/v1/songs/{id}/audio">` when `complete`.
- Lyrics overlay: while a complete Song plays, its lines fade in and out at the center of the
  page. The calibration's cues are the timeline and show their text as-is, so the overlay displays
  exactly what was sung. Without a calibration the lines are spread across the stored ABC vocal
  melody, scaled to the audio duration. When both are missing, lines spread across the Song
  instead. Each line settles in 0.4 s and fades out near its end. The editor dims while the overlay
  is active and returns when the user touches it. A cue carries the active `[Tag]` as its section
  when its text matches a written line.
- Backdrop: the four hand-written trip modes run behind everything. When the active Song has a
  ready visualization (or a reroll in flight), its canvas replaces the trip mode. The visual
  receives audio frames every `requestAnimationFrame` and lyric cues on change; the overlay hides
  while it runs and returns on failure. A swap happens when the checksum changes.
- Reroll: `SongPlayer` always shows a reroll control beside the pulse button. It rerolls the active
  Song when AI is on and the visuals writer has a model, pulses while a run is in flight, and opens
  AI settings when the visuals writer is unconfigured. A failed authoring run or a browser-side
  compile/render failure shows a small badge; reroll clears it and the trip mode covers the gap.
- History list: newest first, the title over its style and status or duration, click to play.

Stage labels:

```text
plan         Writing score
semantic     Writing music
synthesize   Synthesizing
decode       Decoding audio
encode       Encoding mp3
sync         Syncing lyrics
```

If `truncated.abc` or `truncated.semantic` is true, show a warning. The file may still play.

Empty lyrics or style: disable Generate. Do not POST.

### Design

Keep v1 quiet. Form, progress, playback. No marketing layout. Use shadcn `Button`, `Textarea`, `Card`, `Label`. Theme tokens from `globals.css`. Text sizes from the Tailwind theme, not `text-[Npx]`.

## YuE2 request mapping

v1 always sends:

```text
{
  "id": "<song id>",
  "style": "<user style>",
  "lyrics": "<user lyrics>",
  "cot": "full",
  "seed": <number>
}
```

That is `examples/song.json` with the user's words. No `abc` field.

## AI (optional, OpenAI-compatible)

Disabled by default; the UI is unchanged until the settings sigil enables it.
Any OpenAI-compatible endpoint: a preset fills the base URL, the model list
comes from the endpoint's live `/models`, and the API key is stored in
`ai_config` (single JSON row) and surfaced only as a `···abcd` hint.

| Route | Does |
|---|---|
| `GET /v1/ai/presets` | Known endpoints (OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, DeepSeek, Together, Ollama, LM Studio, custom) |
| `GET`/`PUT /v1/ai/config` | Per-writer settings: `presetId`, `baseUrl`, `model`, `effort`, write-only `apiKey` |
| `GET /v1/ai/models?scope=style\|lyrics\|visuals` | Live model list; falls back to preset guesses with a `detail` |
| `POST /v1/ai/enhance` | `{ kind, style?, lyrics? }` → `{ text }` |
| `POST /v1/ai/songs/random` | Style call writes the brief, lyrics call writes the sheet, queued as a normal Song |
| `GET /v1/songs/:id/visualization` | The Song's canvas factory: `ready`/`rerolling` with code and checksum, `pending`, `failed`, or 404 |
| `POST /v1/songs/:id/visualization` | Reroll the canvas factory: 202, 409 when the visuals writer is not ready |

`effort` maps to `reasoning_effort` and is only sent when not `off`. Each model
call retries up to 5 times with no backoff when the endpoint fails or the reply
is unusable; the style brief and lyrics are validated between attempts, while
the visuals writer only requires a non-empty reply because the browser compiles
the code. Failure
modes: 409 when AI is off or a writer is missing a model/key, 502 when the
endpoint fails or the reply is still unusable after retries. Full auto is client-side: one Song
generating at all times, the next one plays when the current one ends, and a
new generation starts the moment playback begins. On track end, full auto
rotates the trip mode only when the finished Song has no ready visualization.

## Failure modes

| Case | HTTP / Song |
|---|---|
| Bad JSON or schema | 400 validation-error |
| Unknown id | 404 not-found |
| Audio requested before complete | 409 conflict |
| ffmpeg missing at boot | process still starts, `/v1/status.ffmpeg = missing`, generate fails the Song |
| YuE2 missing | same, `yue2 = missing` |
| YuE2 OOM or non-zero exit | Song `failed`, detail from stderr tail |
| Truncation | Song `complete`, `truncated` flags true |
| Server crash mid-run | On boot, that Song `failed` |
| Complete Song's audio file missing | Audio route 404s |
| Complete Song's `score.abc` missing | `scoreAbc` omitted from `GET /v1/songs/:id` |
| Reference's media file missing | Song fails before transcription spawns, detail `reference audio is missing` |
| Visualization authoring fails or replies empty | No file; `GET .../visualization` reports `failed` with the detail until a reroll clears it |
| Server restarts mid-authoring | The run is dropped; the Song has no visual until rerolled |
| Visualization code throws or misses a method in the browser | The loop detaches, the trip mode returns, and the badge shows until rerolled |

## Later (not v1)

Unlock by reading files already on disk:

1. Show and download `scoreAbc`.
2. Re-generate from a stored score (`cot=full` plus `abc`).
3. Chord-only edits.
4. Covers via SheetSage2 in a second Python env.

The v1 UI must not block those. Keep `score.abc` in every successful Song's folder.
