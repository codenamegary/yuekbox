# Yuekbox spec

Local web app. User types lyrics and a style, hits Generate, and hears a song.

This is v1 plus reference covers. Later score editing and agent edits stay out of the product surface. The database still keeps the score text so those features can turn on later without a new generator.

## Language

**Song**:
One generate request and its result. Has lyrics, style, status, and optional MP3 audio.
_Avoid_: Track, generation, job, run, render (in the UI and on the wire)

**Request**:
The lyrics and style the user submitted. Stored on the Song.
_Avoid_: Prompt, prompt JSON (except when talking to the YuE2 CLI)

**Score**:
ABC lead sheet YuE2 wrote for the Song. Stored on the Song. Hidden in v1.
_Avoid_: Plan, MIDI, sheet

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

Stage values while `running`: `transcribe`, `plan`, `semantic`, `synthesize`, `decode`, `encode`. Omit `stage` when not running. Covers start at `transcribe`; freeform Songs start at `plan`.

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
- ASR, source separation, lyric recognition, or score editing UI
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
stage             plan | semantic | synthesize | decode | encode   (only when running)
lyrics            string
style             string
seed              number
durationSeconds   number | omitted until complete
truncated         { abc: boolean, semantic: boolean } | omitted until complete
scoreAbc          string | omitted unless complete; only sent by GET one Song
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
├── server.ts
├── db/
│   ├── client.ts
│   └── migrations/
├── media/
│   ├── audio.keys.ts
│   └── audio.store.ts
├── shared/
│   └── result.ts
└── songs/
    ├── songs.models.ts
    ├── songs.ports.ts
    ├── songs.create.usecase.ts
    ├── songs.create.usecase.test.ts
    ├── songs.list.usecase.ts
    ├── songs.list.usecase.test.ts
    ├── songs.get.usecase.ts
    ├── songs.delete.usecase.ts
    ├── songs.media.usecase.ts
    ├── songs.sqlite.adapters.ts
    ├── songs.yue2.adapters.ts
    ├── songs.ffmpeg.adapters.ts
    ├── songs.routes.ts
    ├── songs.assembly.ts
    └── songs.worker.ts
```

`server.ts` loads env, opens SQLite, assembles the songs slice, registers routes, starts the worker, listens, handles SIGTERM.

Use cases are single-shot. The worker loop lives in `songs.worker.ts` (slice coordinator). Routes enqueue then return. The worker claims work.

### Ports

```text
InsertSong
FindSongById
ListSongs
InsertSongAudio
FindSongAudio
SaveSongAudio
ListSongAudio
ListReferenceAudio
MarkSongRunning
MarkSongComplete
MarkSongFailed
ClaimNextQueuedSong
EncodeFlacToMp3
RunYue2Generate
```

`AudioStore` is the media seam: `put`, `stat`, `read`, `openRange`, `remove`, and `list`, keyed by
`<role>/<id><ext>`. Files live under `MEDIA_DIR`. Use cases pass ids; the assembly binds them to
keys. Nothing else touches the filesystem.

`RunYue2Generate` takes `{ lyrics, style, seed, outputDir }` and returns `{ flacPath, scoreAbc, durationSeconds, truncated, stages }` or a Result error. The adapter shells out to the YuE2 venv. It does not import Python.

`EncodeFlacToMp3` takes a FLAC path and returns MP3 `Uint8Array`.

### SQLite

WAL mode. Busy timeout set. File path from env, default `packages/server/data/yuekbox.sqlite`.

Tables hold metadata only. Audio bytes live on disk, so list queries never touch them:

**songs**

```text
id                text pk
status            text not null
stage             text null
lyrics            text not null
style             text not null
seed              integer not null
cot               text not null default 'full'
score_abc         text null
duration_seconds  real null
truncated_abc     integer null
truncated_semantic integer null
error_detail      text null
created_at        text not null
updated_at        text not null
completed_at      text null
```

**song_audio**

```text
song_id           text pk references songs(id) on delete cascade
byte_length       integer not null
content_type      text not null   -- always audio/mpeg in v1
```

File: `MEDIA_DIR/songs/<slug>_<song_id>.mp3`, where the slug is the first sung lyric line (section tags stripped, lowercased, hyphenated, 60 chars max, `untitled` when nothing is left).

**references**

```text
id                text pk
song_id           text null references songs(id) on delete cascade
filename          text not null
content_type      text not null
byte_length       integer not null
score_abc         text null       -- melody-only ABC after transcription
created_at        text not null
```

File: `MEDIA_DIR/references/<id><ext>` at upload, extension derived from `content_type`. Once the Song completes, the worker renames it to `MEDIA_DIR/references/<slug>_<id><ext>` so both files share the song's prefix. A failed rename is logged, never fatal.

Media file names end with `_<id><ext>` or `<id><ext>`. `parseMediaKey` extracts the role and id from any key, so reconcile matches files to rows by id and does not care which shape a file uses. Temp leftovers (`<name>.tmp`) do not parse and are unlinked on the next boot.

Uploads start unattached (`song_id` null). Creating a Song with `referenceId` attaches it.
Unattached References older than 24 hours are purged on boot.

Drizzle schema plus SQL migrations. `db:generate` requires `--name`.

Writes go to `<path>.tmp`, then rename onto the final path, then commit the row. A failed rename or
row commit removes the temp or final file. Deletes remove the row first, then unlink the file.
Crashes can leave orphan files, never a row pointing at a missing file.

On process start: any row with `status = running` becomes `failed` with `errorDetail = "interrupted"`. The GPU job does not resume. Then the media tree reconciles against the tables: files with no row are unlinked, a complete Song whose audio file is missing becomes `failed` with `errorDetail = "audio file missing on disk"`, and missing Reference files are logged; those Songs fail at transcription with a clear detail.

### Generate path

1. `POST /v1/songs` validates body, inserts `queued`, returns `201` and the Song JSON.
2. Route fires `void worker.kick()`.
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
6. If the Song has a Reference, transcribe it before generation. Run `<sheetsage2-python> <kit>/skills/yue2-music/scripts/transcribe.py <MEDIA_DIR>/references/<id><ext> --output <tmp>/transcribe --task melody-full --device cuda --model <SHEETSAGE2_MODEL> [--base-model <SHEETSAGE2_BASE_MODEL>] [--offline]`, read `score.abc`, store it on the Reference, then generate with `cot = melody` and the ABC in the request JSON. A missing file fails the Song before the script spawns; any other failure fails the Song.
7. On success, read `audio.flac`. Encode MP3. Write it to `MEDIA_DIR/songs/<slug>_<song id>.mp3` and insert the `song_audio` row. Rename the attached Reference file to `<slug>_<reference id><ext>`. Set `score_abc` from `score.abc` if present. Mark `complete`. Delete the temp dir (FLAC does not stay on disk).
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
SHEETSAGE2_BASE_MODEL   default unset (let the snapshot resolve its MERT-v2 parent)
SHEETSAGE2_DEVICE       default cuda
SHEETSAGE2_OFFLINE      default 1; set 0 to allow the Hugging Face cache to resolve
REFERENCE_MAX_BYTES     default 26214400 (25 MiB)
```

Bind localhost by default. This app talks to a local GPU.

### Tests

bun:test. Zero mocks. Inline stub ports.

Cover at least:

- Create returns a queued Song and does not call YuE2 (route/worker boundary).
- Create rejects empty lyrics and empty style.
- Get missing id is not-found.
- List does not include audio bytes.
- Complete path with stub `RunYue2Generate` + stub `EncodeFlacToMp3` writes the media file and `complete`.
- Encode failure marks `failed` and leaves `song_audio` empty.
- Saving the media unlinks the file when the row commit fails.
- Media keys slug the first lyric line and parse both name shapes back to the id.
- `GET /v1/songs/:id/audio` serves a range from a multi-megabyte file without reading it whole, and still serves a bare id file.
- Deleting a Song unlinks its media; a stale purge unlinks each deleted Reference file.
- Transcribe points the script at the stored path and fails before spawning when the file is missing.
- Reconcile unlinks orphans and fails a complete Song whose media file is missing.
- Claim skips `running` and `complete`.
- Boot recovery: `running` becomes `failed`.

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
    ├── songs.api.ts
    ├── songs.queries.ts
    └── songs.mutations.ts
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
  page. Timing comes from the stored ABC vocal melody, scaled to the audio duration; when the
  score is missing, lines spread across the Song instead. The editor dims while the overlay is
  active and returns when the user touches it.
- History list: newest first, click to play.

Stage labels:

```text
plan         Writing score
semantic     Writing music
synthesize   Synthesizing
decode       Decoding audio
encode       Encoding mp3
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
| `GET /v1/ai/models?scope=style\|lyrics` | Live model list; falls back to preset guesses with a `detail` |
| `POST /v1/ai/enhance` | `{ kind, style?, lyrics? }` → `{ text }` |
| `POST /v1/ai/songs/random` | Style call writes the brief, lyrics call writes the sheet, queued as a normal Song |

`effort` maps to `reasoning_effort` and is only sent when not `off`. Each model
call retries up to 5 times with no backoff when the endpoint fails or the reply
is unusable; the style brief and lyrics are validated between attempts. Failure
modes: 409 when AI is off or a writer is missing a model/key, 502 when the
endpoint fails or the reply is still unusable after retries. Full auto is client-side: one Song
generating at all times, the next one plays when the current one ends, and a
new generation starts the moment playback begins.

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
| Complete Song's media file missing at boot | Song `failed`, detail `audio file missing on disk` |
| Reference's media file missing | Song fails at transcription with a clear detail |

## Later (not v1)

Unlock by revealing data already in SQLite:

1. Show and download `scoreAbc`.
2. Re-generate from a stored score (`cot=full` plus `abc`).
3. Chord-only edits.
4. Covers via SheetSage2 in a second Python env.

The v1 UI must not block those. Keep `score_abc` on every successful Song.
