# yue2

`generate.py` is yuekbox's song-generation entrypoint. It owns the interface to
the pinned `yue2-infer` runtime
(`packages/server/src/runtime/runtime.pins.ts`): the flags, the request fields,
and the artifact layout. The runtime is not on PyPI, so provisioning installs
it from the pinned git commit into `<home>/venvs/yue2`.

## Usage

```bash
~/.yuekbox/venvs/yue2/bin/python \
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
`lyrics`, `cot`, `seed`, and optional `abc`. Artifacts land in
`<output>/<id>/`: `audio.flac`, `result.json`, and `score.abc`. The server reads
`audio.flac`, `score.abc`, and `result.json` (`audio_seconds` and the
truncation flags).

## Why not `python -m yue2 generate`

The script calls the yue2 library directly. A runtime bump that changes the
upstream CLI cannot then change our flags or our artifact layout silently; a
changed library API fails loudly in one reviewed file. Model paths arrive as
arguments, so the script never works out a checkout, kit, or venv location on
its own.
