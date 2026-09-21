#!/usr/bin/env python3
"""
Lyric calibration from a Whisper transcript stream.

  1. Demucs (htdemucs) separates the vocal stem from the track.
  2. whisper-large-v3-turbo transcribes the stem with word timestamps.
  3. Units inside long quiet runs are dropped, because Whisper hallucinates
     words over instrumental stretches.
  4. Display lines are grouped from the surviving stream at pauses and
     sentence ends, and their timings come straight from the words.

Writes a rich alignment.json and an app-shaped calibration.json
(version 1, source "transcribe"). Everything stays next to the song.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

PAUSE_GAP_SECONDS = 0.8
MAX_CUE_WORDS = 9
SILENCE_RELATIVE_DB = -20.0
SILENCE_MIN_SECONDS = 0.8
DEFAULT_WHISPER_MODEL = "openai/whisper-large-v3-turbo"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", required=True, help="track to transcribe (mp3/flac/wav)")
    parser.add_argument("--out", required=True, help="directory for stems and rich output")
    parser.add_argument(
        "--calibration-out",
        default=None,
        help="where to write the app-shaped calibration.json",
    )
    parser.add_argument("--whisper-model", default=DEFAULT_WHISPER_MODEL)
    parser.add_argument("--demucs-model", default="htdemucs")
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--skip-demucs", action="store_true")
    return parser.parse_args()


def read_duration_seconds(audio_path: Path) -> float:
    import soundfile

    info = soundfile.info(str(audio_path))
    return info.frames / info.samplerate


def separate_vocals(audio_path: Path, out_dir: Path, model: str) -> Path:
    """Run demucs unless a cached stem is already there and fresh."""
    vocals_path = out_dir / model / audio_path.stem / "vocals.wav"
    if vocals_path.exists() and vocals_path.stat().st_mtime >= audio_path.stat().st_mtime:
        print(f"[align] reusing cached vocal stem {vocals_path}")
        return vocals_path
    out_dir.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "-m",
        "demucs",
        "--two-stems=vocals",
        "-n",
        model,
        "-o",
        str(out_dir),
        str(audio_path),
    ]
    print(f"[align] separating vocals: {' '.join(command)}")
    subprocess.run(command, check=True)
    if not vocals_path.exists():
        raise FileNotFoundError(f"demucs did not produce {vocals_path}")
    return vocals_path


def transcribe_whisper(audio_path: Path, model_id: str, device: str) -> list[dict]:
    """Word timestamps from a Whisper transcription of the vocal stem."""
    import torch
    from transformers import pipeline

    device_index = 0 if device.startswith("cuda") else -1
    recognizer = pipeline(
        "automatic-speech-recognition",
        model=model_id,
        torch_dtype=torch.float16 if device_index == 0 else torch.float32,
        device=device_index,
    )
    result = recognizer(
        str(audio_path),
        return_timestamps="word",
        chunk_length_s=30,
        stride_length_s=5,
    )
    units: list[dict] = []
    for chunk in result.get("chunks", []):
        text = str(chunk.get("text", "")).strip()
        timestamp = chunk.get("timestamp")
        if text == "" or timestamp is None:
            continue
        start, end = timestamp
        start_seconds = float(start) if start is not None else 0.0
        end_seconds = float(end) if end is not None else start_seconds + 0.2
        if end_seconds <= start_seconds:
            end_seconds = start_seconds + 0.05
        previous = units[-1] if units else None
        if (
            previous is not None
            and previous["text"].lower() == text.lower()
            and start_seconds < previous["endSeconds"]
        ):
            continue
        units.append({"text": text, "startSeconds": start_seconds, "endSeconds": end_seconds})
    return units


def detect_silences(
    audio_path: Path,
    relative_db: float = SILENCE_RELATIVE_DB,
    min_seconds: float = SILENCE_MIN_SECONDS,
) -> list[tuple[float, float]]:
    """Long quiet runs in the stem, as (start, end) seconds."""
    import soundfile
    import numpy as np

    data, samplerate = soundfile.read(str(audio_path), dtype="float32", always_2d=True)
    mono = data.mean(axis=1)
    frame = 2048
    hop = 512
    frames = np.lib.stride_tricks.sliding_window_view(mono, frame)[::hop]
    rms = 20 * np.log10(np.sqrt((frames**2).mean(axis=1)) + 1e-9)
    quiet = rms < (rms.max() + relative_db)

    silences: list[tuple[float, float]] = []
    run_start: int | None = None
    for index, is_quiet in enumerate(quiet):
        if is_quiet and run_start is None:
            run_start = index
        elif not is_quiet and run_start is not None:
            if (index - run_start) * hop / samplerate >= min_seconds:
                silences.append((run_start * hop / samplerate, index * hop / samplerate))
            run_start = None
    if run_start is not None:
        end = len(quiet)
        if (end - run_start) * hop / samplerate >= min_seconds:
            silences.append((run_start * hop / samplerate, end * hop / samplerate))
    return silences


def drop_silent_units(units: list[dict], silences: list[tuple[float, float]]) -> list[dict]:
    """Drop transcript units whose midpoint lands in a quiet run."""
    if not silences:
        return units
    kept: list[dict] = []
    for unit in units:
        midpoint = (unit["startSeconds"] + unit["endSeconds"]) / 2
        if any(start <= midpoint <= end for start, end in silences):
            continue
        kept.append(unit)
    return kept


def build_transcript_cues(
    units: list[dict],
    duration_seconds: float,
    gap_seconds: float = PAUSE_GAP_SECONDS,
    max_words: int = MAX_CUE_WORDS,
) -> list[dict]:
    """Display lines straight from a transcript stream, split at pauses."""
    if not units:
        return []
    ordered = sorted(units, key=lambda unit: unit["startSeconds"])
    groups: list[list[dict]] = []
    current: list[dict] = []
    for unit in ordered:
        if current and unit["startSeconds"] - current[-1]["endSeconds"] > gap_seconds:
            groups.append(current)
            current = []
        current.append(unit)
        ends_sentence = bool(re.search(r"[.!?][\"')\]]?$", unit["text"].strip()))
        if len(current) >= max_words or (len(current) >= 3 and ends_sentence):
            groups.append(current)
            current = []
    if current:
        groups.append(current)

    cues: list[dict] = []
    previous_end = 0.0
    for group in groups:
        text = re.sub(r"\s+", " ", " ".join(unit["text"] for unit in group)).strip()
        if text == "":
            continue
        start = max(previous_end, max(0.0, min(group[0]["startSeconds"], duration_seconds)))
        end = max(group[-1]["endSeconds"], start + 0.05)
        end = min(max(end, start + 0.05), max(duration_seconds, start + 0.05))
        cues.append(
            {
                "text": text,
                "section": None,
                "startSeconds": round(start, 3),
                "endSeconds": round(end, 3),
                "words": len(group),
            }
        )
        previous_end = end
    return cues


def build_spans(units: list[dict], duration_seconds: float) -> list[dict]:
    """Group words into phrase spans, splitting at a gap over a breath."""
    timed = sorted(units, key=lambda unit: unit["startSeconds"])
    spans: list[dict] = []
    last_start: float | None = None
    for unit in timed:
        start = min(max(unit["startSeconds"], 0.0), duration_seconds)
        end = min(max(unit["endSeconds"], 0.0), duration_seconds)
        current = spans[-1] if spans else None
        if current is None or last_start is None or start - last_start > PAUSE_GAP_SECONDS:
            spans.append(
                {
                    "startSeconds": round(start, 3),
                    "endSeconds": round(end, 3),
                    "noteCount": 1,
                }
            )
        else:
            current["endSeconds"] = max(current["endSeconds"], round(end, 3))
            current["noteCount"] += 1
        last_start = start
    return spans


def main() -> int:
    args = parse_args()
    audio_path = Path(args.audio).resolve()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    duration_seconds = read_duration_seconds(audio_path)
    print(f"[align] {duration_seconds:.1f}s, model {args.whisper_model}")

    started = time.time()
    vocals_path = audio_path
    if not args.skip_demucs:
        vocals_path = separate_vocals(audio_path, out_dir / "demucs", args.demucs_model)
    separation_seconds = time.time() - started

    transcribe_started = time.time()
    units = transcribe_whisper(vocals_path, args.whisper_model, args.device)
    transcribe_seconds = time.time() - transcribe_started
    print(f"[align] whisper produced {len(units)} word timestamps")

    gate_started = time.time()
    silences = detect_silences(vocals_path)
    before = len(units)
    units = drop_silent_units(units, silences)
    if len(units) < before:
        print(f"[align] dropped {before - len(units)} units inside vocal silence")
    gate_seconds = time.time() - gate_started

    cues = build_transcript_cues(units, duration_seconds)
    spans = build_spans(units, duration_seconds)
    print(f"[align] {len(cues)} transcript cues, {len(spans)} phrase spans")

    report = {
        "version": 1,
        "backend": "whisper",
        "model": args.whisper_model,
        "demucs": None if args.skip_demucs else args.demucs_model,
        "audio": audio_path.name,
        "durationSeconds": round(duration_seconds, 3),
        "timings": {
            "separationSeconds": round(separation_seconds, 2),
            "transcriptionSeconds": round(transcribe_seconds, 2),
            "gateSeconds": round(gate_seconds, 2),
        },
        "units": [
            {
                "text": unit["text"],
                "startSeconds": round(unit["startSeconds"], 3),
                "endSeconds": round(unit["endSeconds"], 3),
            }
            for unit in units
        ],
        "spans": spans,
        "cues": cues,
    }
    alignment_path = out_dir / "alignment.json"
    alignment_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"[align] wrote {alignment_path}")

    if args.calibration_out is not None:
        calibration = {
            "version": 1,
            "source": "transcribe",
            "spans": [
                {"startSeconds": span["startSeconds"], "endSeconds": span["endSeconds"]}
                for span in spans
            ],
            "cues": [
                {
                    "text": cue["text"],
                    "startSeconds": cue["startSeconds"],
                    "endSeconds": cue["endSeconds"],
                }
                for cue in cues
            ],
        }
        calibration_path = Path(args.calibration_out).resolve()
        calibration_path.parent.mkdir(parents=True, exist_ok=True)
        calibration_path.write_text(json.dumps(calibration, indent=2) + "\n", encoding="utf-8")
        print(f"[align] wrote {calibration_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
