#!/usr/bin/env python3
# Owned by yuekbox, not vendored. The server's yue2 adapter sends exactly the
# flags below and reads exactly this output layout; a runtime bump is reviewed
# against this file.

"""Generate one song with the pinned yue2-infer runtime.

Usage:

    generate.py --request request.json --output DIR
                --model MODELS_YUE2 --vae MODELS_YUE2_VAE
                --budget GIB [--offline] [--device DEVICE]

`request.json` carries the yue2 `SongRequest` fields yuekbox sets: `id`,
`style`, `lyrics`, `cot`, `seed`, and optional `abc`. Artifacts land in
`<output>/<id>/`: `audio.flac`, `result.json`, and `score.abc`.

This calls the yue2 library directly instead of forwarding to
`python -m yue2 generate`, so the flag names, the request surface, and the
output layout stay ours. A runtime bump that changes its CLI cannot change
our contract silently, and a changed library API fails loudly here.
"""

from __future__ import annotations

import argparse
import json
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
    parser.add_argument("--device", default="cuda")
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


def run(args: argparse.Namespace) -> int:
    from yue2 import YuE2Pipeline
    from yue2.protocol import SongRequest

    request = SongRequest(**read_request(args.request))
    directory = Path(args.output) / request.id
    if directory.exists() and any(directory.iterdir()):
        raise FileExistsError(f"output directory is not empty: {directory}")
    directory.mkdir(parents=True, exist_ok=True)
    try:
        with YuE2Pipeline.from_pretrained(
            args.model,
            vae=args.vae,
            device=args.device,
            memory_budget_gib=args.budget,
            local_files_only=args.offline,
        ) as pipe:
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
