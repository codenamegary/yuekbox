# sheetsage2

SheetSage2 transcription for reference covers and for the measured analysis of a
rendered Song. Vendored from
[YuE](https://github.com/multimodal-art-projection/YuE) revision
`bd90e4ccae671d869b3ecaca6d7e893927d29442`,
`skills/yue2-music/scripts/` (Apache-2.0). `transcribe.py` imports `abc_tools`
and `common` as siblings, so the installer copies all three flat into
`<home>/scripts/`.

## Usage

The generation worker runs it two ways: `--task melody-full` on an uploaded
Reference before generation, and `--task melody-vocal` on the rendered FLAC to
measure notes, beats, and sections.

```bash
~/.yuekbox/venvs/sheetsage2/bin/python \
  ~/.yuekbox/scripts/transcribe.py "<audio>" \
  --output "<fresh output dir>" \
  --task melody-full \
  --device cuda \
  --model "<models.sheetsage2>" \
  --base-model "<models.sheetsage2Base>" \
  --offline
```

- `melody-full` writes `score.abc`; the adapter writes it to
  `reference_score.abc` in the Song folder.
- `melody-vocal` writes `melody_vocal.lab`, `beat.lab`, and `structure.lab`;
  the adapter parses them into `analysis.json`.
- Model paths come from the config resolver, never from a YuE checkout.

The server runs the venv and script from yuekbox's home
(`~/.yuekbox/venvs/sheetsage2/bin/python` and `~/.yuekbox/scripts/transcribe.py`
by default; `SHEETSAGE2_PYTHON`, `SHEETSAGE2_SCRIPT`, `SHEETSAGE2_DEVICE`, and
`SHEETSAGE2_OFFLINE` are internal env overrides). The script source lives in
this folder; the installer copies it into the home.
