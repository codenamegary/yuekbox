# yue2

`generate.py` is yuekbox's song-generation entrypoint. It owns the interface to
the pinned `yue2-infer` runtime
(`packages/server/src/runtime/runtime.pins.ts`): the flags, the request fields,
and the artifact layout. The runtime is not on PyPI, so provisioning installs
it from the pinned git commit into the shared environment at `<home>/venvs/python`.

## Usage

```bash
~/.yuekbox/venvs/python/bin/python \
  ~/.yuekbox/scripts/generate.py \
  --request "<tmp>/request.json" \
  --output "<tmp>/out" \
  --model "<models.yue2>" \
  --vae "<models.yue2Vae>" \
  --budget 16 \
  --offline \
  --device cuda
```

`request.json` carries the `SongRequest` fields yuekbox sets: `id`, `style`,
`lyrics`, `cot`, `seed`, `cfg_scale`, optional `abc`, and optional
`instrumental`. Artifacts land in `<output>/<id>/`: `audio.flac`, `result.json`,
and `score.abc`. The server reads `audio.flac`, `score.abc`, and `result.json`
(`audio_seconds` and the truncation flags).

An instrumental request runs two passes. Without `abc` it first plans a score at
default guidance with section-skeleton lyrics, then moves every sounding Vocal
note to Ins with the vendored `instrumentalize.py` / `compile_score.py` (this
directory; installed flat beside `abc_tools.py` and `common.py`) — chords kept,
lyrics are the score's section tags only — and renders the converted score at
the request's `cfg_scale`, keeping the plan under `<output>/<id>/planning/`.
With `abc` it skips planning, transfers the provided score with chords dropped,
and renders `cot = melody` from it. A truncated or empty plan fails the Song.
Vocal requests are unchanged, byte for byte.

## Why not `python -m yue2 generate`

The script calls the yue2 library directly. A runtime bump that changes the
upstream CLI cannot then change our flags or our artifact layout silently; a
changed library API fails loudly in one reviewed file. Model paths arrive as
arguments, so the script never works out a checkout, kit, or venv location on
its own.
