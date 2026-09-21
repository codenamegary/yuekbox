# lyric-align

Transcription calibrations for lyric cues. One method, no written-lyric matching:

```text
generated_<id>.mp3
  -> demucs --two-stems=vocals             (vocal stem)
  -> whisper-large-v3-turbo                (word timestamps)
  -> drop units in long quiet runs         (Whisper hallucinates on music)
  -> group words into display lines        (pauses and sentence ends)
```

The visualizer shows the transcript stream and its real timings, so ad-libs,
repeats, and mishearings appear exactly as sung and the cues cannot drift from
the audio.

## Usage

```bash
~/sites/yue2/.venv-lyricalign/bin/python \
  packages/server/tools/lyric-align/align.py \
  --audio "<song folder>/generated_<song id>.mp3" \
  --out "<song folder>/alignment" \
  --calibration-out "<song folder>/calibration.json"
```

- `alignment/alignment.json` is the rich record: every word with timings, the
  display cues, phrase spans, and stage timings.
- `alignment/demucs/.../vocals.wav` is cached and reused on later runs.
- `calibration.json` is the app-shaped file the server reads. It uses
  `source: "transcribe"` and carries the display lines as `cues`.

## Notes

- The silence gate marks runs quieter than peak minus 20 dB for at least 0.8 s,
  then drops any transcript unit whose midpoint lands inside. That is what
  removes Whisper's phantom words over instrumental stretches.
- Display lines break at pauses over 0.8 s, at sentence ends, and after 9 words.
- Why large-v3-turbo: whisper-small.en looped over an ad-libbed intro and missed
  three whole lines. Large-v3-turbo recovered them and transcribed the clean
  rap songs nearly word for word.
- The line splitter this tool used to mirror for written-lyric matching is gone.
  Transcription calibrations are the only mode now.

## Status

Experiment. Not wired into the generation worker, which still writes SheetSage2
spans for new songs. Run this by hand and the calibration sits next to the song.
