#!/usr/bin/env python3
# Owned by yuekbox, not vendored. The server's yue2 adapter sends exactly the
# flags below and reads exactly this output layout; a runtime bump is reviewed
# against this file.

"""Generate one song with the pinned yue2-infer runtime.

Usage:

    generate.py --request request.json --output DIR
                --model MODELS_YUE2 --vae MODELS_YUE2_VAE
                --budget GIB [--offline] [--device DEVICE]
                [--backend {torch,mlx}] [--precision PRECISION]

`request.json` carries the yue2 `SongRequest` fields yuekbox sets: `id`,
`style`, `lyrics`, `cot`, `seed`, and optional `abc`. Artifacts land in
`<output>/<id>/`: `audio.flac`, `result.json`, and `score.abc`.

This calls the runtime library directly instead of forwarding to a CLI, so the
flag names, the request surface, and the output layout stay ours. A runtime
bump that changes its CLI cannot change our contract silently, and a changed
library API fails loudly here.

Backends:

    torch  the pinned yue2-infer runtime on CUDA (Linux, WSL2). Default.
    mlx    the pinned mlx-yue runtime on Apple Silicon. Its `lyra` pipeline
           subclasses the same upstream implementation, so the request
           surface, the progress lines, and the artifact layout are identical;
           only the import and the constructor arguments differ. `--device`
           does not apply (MLX always runs on the Metal GPU); the weights are
           selected with `--precision` (bf16, 8bit, 4bit).

Bench mode: with YUEKBOX_BENCH=1 in the environment this script skips every
runtime import and renders the same artifact layout from a synthesized tone —
a CI bench on small hosted hardware verifies the plumbing, not the model.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REQUEST_FIELDS = frozenset({"id", "style", "lyrics", "cot", "seed", "abc"})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, type=Path, help="song request JSON")
    parser.add_argument(
        "--output", required=True, type=Path, help="fresh output root; the song lands in <output>/<id>"
    )
    parser.add_argument("--model", required=True, help="YuE2-3B model directory or repository")
    parser.add_argument("--vae", required=True, help="YuE2-Vae model directory or repository")
    parser.add_argument("--budget", type=float, default=16, help="GPU memory budget in GiB")
    parser.add_argument("--offline", action="store_true", help="resolve only local model files")
    parser.add_argument("--device", default="cuda", help="torch backend device")
    parser.add_argument("--backend", choices=("torch", "mlx"), default="torch")
    parser.add_argument("--precision", default="8bit", help="mlx AR weights: bf16, 8bit or 4bit")
    return parser.parse_args()


def read_request(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("request must be a JSON object")
    unknown = sorted(set(data) - REQUEST_FIELDS)
    if unknown:
        raise ValueError(f"unsupported request fields: {unknown}")
    return data


def write_failure(directory: Path, error: BaseException) -> None:
    failure = {"status": "failed", "type": type(error).__name__, "error": str(error)}
    try:
        (directory / "failure.json").write_text(json.dumps(failure, indent=2) + "\n", encoding="utf-8")
    except OSError:
        pass


def load_pipeline(backend: str):
    """One import site per runtime; both subclasses share the upstream API."""
    if backend == "mlx":
        from lyra import YuE2Pipeline
    else:
        from yue2 import YuE2Pipeline
    return YuE2Pipeline


BENCH_ABC = """X:1
T:yuekbox bench song
C:yuekbox bench mode
M:4/4
L:1/8
Q:1/4=100
K:C
"C"CDEF "G"G2zz | "Am"A2B2 "F"c2zz |
"""

BENCH_STAGES = (
    ("Planning score", 1),
    ("Generating song", 2),
    ("Synthesizing audio", 3),
    ("Decoding audio", 4),
)

BENCH_SECONDS = 8.0


def bench_enabled() -> bool:
    """CI bench mode: same contracts, no neural runtime, deterministic output."""
    return os.environ.get("YUEKBOX_BENCH") == "1"


def bench_synth_wav(path: Path, seconds: float, rate: int = 8000) -> None:
    import math
    import struct
    import wave

    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        frames = bytearray()
        fade = 0.25
        for index in range(int(seconds * rate)):
            moment = index / rate
            gain = min(1.0, moment / fade, max(0.0, (seconds - moment) / fade))
            sample = int(12000 * gain * math.sin(2 * math.pi * 220 * moment))
            frames += struct.pack("<h", sample)
        handle.writeframes(bytes(frames))


def bench_run(args: argparse.Namespace) -> int:
    import subprocess

    request = read_request(args.request)
    song_id = str(request["id"])
    directory = Path(args.output) / song_id
    if directory.exists() and any(directory.iterdir()):
        raise FileExistsError(f"output directory is not empty: {directory}")
    directory.mkdir(parents=True, exist_ok=True)

    for label, index in BENCH_STAGES:
        percent = int(index / len(BENCH_STAGES) * 100)
        print(f"{label} {index}/{len(BENCH_STAGES)} steps ({percent}%)", flush=True)

    wav_path = directory / "bench.wav"
    bench_synth_wav(wav_path, BENCH_SECONDS)
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-i", str(wav_path), "-c:a", "flac",
                str(directory / "audio.flac"),
            ],
            check=True,
        )
    finally:
        wav_path.unlink(missing_ok=True)
    (directory / "score.abc").write_text(BENCH_ABC, encoding="utf-8")
    result = {
        "status": "complete",
        "audio_seconds": BENCH_SECONDS,
        "truncated": {"abc": False, "semantic": False},
    }
    (directory / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "status": "complete",
                "id": song_id,
                "directory": str(directory),
                "audio_seconds": BENCH_SECONDS,
                "truncated": result["truncated"],
            }
        )
    )
    return 0


def run(args: argparse.Namespace) -> int:
    if bench_enabled():
        return bench_run(args)

    from yue2.protocol import SongRequest

    YuE2Pipeline = load_pipeline(args.backend)

    request = SongRequest(**read_request(args.request))
    directory = Path(args.output) / request.id
    if directory.exists() and any(directory.iterdir()):
        raise FileExistsError(f"output directory is not empty: {directory}")
    directory.mkdir(parents=True, exist_ok=True)
    try:
        if args.backend == "mlx":
            pipeline = YuE2Pipeline.from_pretrained(
                args.model,
                vae=args.vae,
                precision=args.precision,
                memory_budget_gib=args.budget,
                local_files_only=args.offline,
                progress=True,
            )
        else:
            pipeline = YuE2Pipeline.from_pretrained(
                args.model,
                vae=args.vae,
                device=args.device,
                memory_budget_gib=args.budget,
                local_files_only=args.offline,
            )
        with pipeline as pipe:
            result = pipe(**request.to_dict())
        receipt = result.save_artifacts(directory)
    except BaseException as error:
        write_failure(directory, error)
        raise
    print(
        json.dumps(
            {
                "status": "complete",
                "id": request.id,
                "directory": str(directory),
                "audio_seconds": receipt["audio_seconds"],
                "truncated": receipt["truncated"],
            }
        )
    )
    return 0


def main() -> int:
    args = parse_args()
    try:
        return run(args)
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
