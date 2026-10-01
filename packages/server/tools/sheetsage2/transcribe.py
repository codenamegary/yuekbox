#!/usr/bin/env python3
# Vendored from YuE (https://github.com/multimodal-art-projection/YuE) revision
# bd90e4ccae671d869b3ecaca6d7e893927d29442, skills/yue2-music/scripts/transcribe.py.
# Apache-2.0; see the upstream LICENSE. Vendored verbatim: yuekbox owns this copy
# and its contract. Installed flat beside abc_tools.py and common.py.
"""Transcribe audio to native ABC using SheetSage2.

Backends (--backend):

    torch  SheetSage2's Transformers interface on CUDA (Linux, WSL2). Default.
           The model and its remote code load straight from the model folder.
    mlx    the native MLX SheetSage2/MERT2 engine from the pinned mlx-yue
           runtime (Apple Silicon). Same task names, same window presets,
           and the same exported artifacts (score.abc plus the .lab files);
           only the engine and the loader differ. `--device` does not apply.

Bench mode: with YUEKBOX_BENCH=1 in the environment this script skips every
model import and writes the same artifacts from canned rows — a CI bench on
small hosted hardware verifies the plumbing, not the transcription.
"""

import argparse
import hashlib
import importlib.metadata
import inspect
import json
import os
import sys
import types
from importlib import import_module
from pathlib import Path

from abc_tools import parse_abc, report
from common import fresh_directory, sha256, write_json


def class_from_local_snapshot(model_dir: Path, auto_key: str = "AutoModel"):
    """Load a custom Auto class from a local snapshot directory.

    Transformers' trust_remote_code path copies selected files into
    ~/.cache/huggingface/modules/transformers_modules and imports that copy.
    Relative imports then miss sibling files that were never copied. A local
    yuekbox snapshot already has the full tree, so we import it in place.
    """
    model_dir = model_dir.resolve()
    if not model_dir.is_dir():
        raise FileNotFoundError(model_dir)
    config = json.loads((model_dir / "config.json").read_text(encoding="utf-8"))
    dotted = config["auto_map"][auto_key]
    module_name, class_name = dotted.rsplit(".", 1)
    pkg_name = "yuekbox_snapshot_" + hashlib.sha256(str(model_dir).encode()).hexdigest()[:16]
    if pkg_name not in sys.modules:
        pkg = types.ModuleType(pkg_name)
        pkg.__path__ = [str(model_dir)]
        pkg.__file__ = str(model_dir / "__init__.py")
        pkg.__package__ = pkg_name
        sys.modules[pkg_name] = pkg
    return getattr(import_module(f"{pkg_name}.{module_name}"), class_name)


def wrap_automodel_for_local_snapshots() -> None:
    """Route AutoModel.from_pretrained through the snapshot when the path is a directory.

    SheetSage2's own from_pretrained still calls AutoModel for the MERT parent.
    The wrap covers that nested load too.
    """
    from transformers import AutoModel

    if getattr(AutoModel, "_yuekbox_local_snapshots", False):
        return
    original = AutoModel.from_pretrained

    def from_pretrained(cls, pretrained_model_name_or_path, *args, **kwargs):
        path = Path(pretrained_model_name_or_path)
        if path.is_dir() and (path / "config.json").is_file():
            model_cls = class_from_local_snapshot(path)
            kwargs = dict(kwargs)
            kwargs.pop("trust_remote_code", None)
            kwargs.pop("code_revision", None)
            kwargs["local_files_only"] = True
            return model_cls.from_pretrained(str(path), *args, **kwargs)
        return original(pretrained_model_name_or_path, *args, **kwargs)

    AutoModel.from_pretrained = classmethod(from_pretrained)
    AutoModel._yuekbox_local_snapshots = True


def transcribe_mlx(args, output, prompts, melody_only):
    """The Apple Silicon path: the pinned lyra engine, local weights only."""
    from lyra.transcription import transcribe

    result = transcribe(
        args.audio,
        output,
        model_path=args.model,
        base_model=args.base_model,
        offline=args.offline,
        task=args.task,
        preset=args.preset,
        max_seconds=args.max_seconds,
    )
    if result.get("abc_error") or not result.get("abc"):
        raise ValueError(f"Transcription produced no usable ABC: {result.get('abc_error')}")
    score = parse_abc(result["abc"])
    if melody_only and any(v.chords for v in score.voices.values()):
        raise ValueError("Melody transcription contains unexpected chord symbols")
    write_json(output / "abc_check.json", {"status": "passed", "score": report(score),
               "scope": "symbolic format; transcription accuracy still needs review"})
    write_json(output / "transcription_manifest.json", {
        "status": "complete", "warnings": result.get("warnings", []),
        "backend": "mlx", "model": result.get("model"),
        "source_audio_sha256": result.get("source_audio_sha256"),
        "truncated": result.get("truncated", False),
    })
    print(f"Saved {output / 'score.abc'}; warnings: {result.get('warnings', [])}")


BENCH_ABC = """X:1
T:yuekbox bench reference
C:yuekbox bench mode
M:4/4
L:1/8
Q:1/4=100
K:C
"C"CDEF "G"G2zz | "Am"A2B2 "F"c2zz |
"""


def bench_duration_seconds(audio: Path) -> float:
    import subprocess

    try:
        probed = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(audio)],
            check=True, capture_output=True, text=True,
        )
        return max(1.0, float(probed.stdout.strip()))
    except Exception:
        return 8.0


def bench_run(args) -> int:
    output = fresh_directory(args.output)
    duration = bench_duration_seconds(Path(args.audio))
    if args.task == "melody-vocal":
        notes, beats = [], []
        pitches = (60, 64, 67, 65)
        second, position = 0.0, 1
        while second + 1.0 <= duration:
            notes.append(f"{second:.3f} {second + 0.75:.3f} {pitches[len(notes) % 4]}")
            beats.append(f"{second:.3f} {position} 4 4")
            second += 1.0
            position = position % 4 + 1
        (output / "melody_vocal.lab").write_text("\n".join(notes) + "\n", encoding="utf-8")
        (output / "beat.lab").write_text("\n".join(beats) + "\n", encoding="utf-8")
        (output / "structure.lab").write_text(
            f"0.000 {duration / 2:.3f} verse\n{duration / 2:.3f} {duration:.3f} chorus\n",
            encoding="utf-8",
        )
    else:
        (output / "score.abc").write_text(BENCH_ABC, encoding="utf-8")
    print(f"[bench] wrote {args.task} artifacts to {output}")
    return 0


def run(args):
    if os.environ.get("YUEKBOX_BENCH") == "1":
        return bench_run(args)
    if not args.audio.is_file():
        raise FileNotFoundError(args.audio)
    if args.max_seconds is not None and args.max_seconds <= 0:
        raise ValueError("--max-seconds must be positive and explicitly crops the input")
    output = fresh_directory(args.output)
    melody_only = args.task != "full"
    prompts = ["timestamp", "downbeat_meter", "structure", "key"]
    if args.task == "full":
        prompts += ["chord_full", "melody_full"]
    else:
        prompts += ["melody_vocal" if args.task == "melody-vocal" else "melody_full"]
    write_json(output / "input.json", {
        "source_name": args.audio.name, "source_audio_sha256": sha256(args.audio),
        "model": args.model, "revision": args.revision, "offline": args.offline,
        "base_model_path": args.base_model, "prompts": prompts, "melody_only": melody_only,
        "preset": args.preset, "max_seconds": args.max_seconds,
        "device": args.device, "dtype": args.dtype, "backend": args.backend,
    })
    try:
        if args.backend == "mlx":
            transcribe_mlx(args, output, prompts, melody_only)
            return
        import torch
        from transformers import AutoModel

        torch.set_num_threads(args.threads)
        model_path = Path(args.model)
        loader = {}
        if model_path.is_dir():
            wrap_automodel_for_local_snapshots()
            loader["local_files_only"] = True
        else:
            loader["trust_remote_code"] = True
            loader["local_files_only"] = args.offline
            if args.revision:
                loader.update(revision=args.revision, code_revision=args.revision)
        if args.base_model:
            loader["base_model_path"] = args.base_model
        model = AutoModel.from_pretrained(args.model, **loader).eval().to(args.device)
        options = {}
        if melody_only:
            try:
                parameter = inspect.signature(model.transcribe).parameters.get("melody_only")
            except (TypeError, ValueError) as exc:
                raise RuntimeError("Cannot verify SheetSage2's melody_only interface; refresh the model code "
                                   "to a reviewed revision exposing melody_only explicitly") from exc
            if parameter is None or parameter.kind == inspect.Parameter.POSITIONAL_ONLY:
                raise RuntimeError("This SheetSage2 revision does not expose melody_only; refresh the model "
                                   "and remote code to a reviewed revision supporting melody_only=True")
            options["melody_only"] = True
        snapshot = Path(getattr(model, "_source_snapshot", args.model))
        files = {}
        if snapshot.is_dir():
            for path in sorted(snapshot.iterdir()):
                if path.is_file() and (path.suffix in {".py", ".safetensors"} or path.name == "config.json"):
                    files[path.name] = sha256(path)
        write_json(output / "model_provenance.json", {
            "model": args.model, "requested_revision": args.revision,
            "config": model.config.to_dict(), "snapshot_sha256": files,
            "packages": {name: importlib.metadata.version(name) for name in ("torch", "transformers", "huggingface-hub")},
        })
        result = model.transcribe(
            str(args.audio), output_dir=str(output), prompts=prompts,
            dtype=args.dtype, preset=args.preset, max_seconds=args.max_seconds, **options,
        )
        if result.get("abc_error") or not result.get("abc"):
            raise ValueError(f"Transcription produced no usable ABC: {result.get('abc_error')}")
        score = parse_abc(result["abc"])
        if args.task != "full" and any(v.chords for v in score.voices.values()):
            raise ValueError("Melody transcription contains unexpected chord symbols")
        if not (output / "score.abc").is_file():
            raise ValueError("Transcriber did not save score.abc")
        write_json(output / "abc_check.json", {"status": "passed", "score": report(score),
                   "scope": "symbolic format; transcription accuracy still needs review"})
        write_json(output / "transcription_manifest.json", {
            "status": "complete", "warnings": result.get("warnings", []),
            "source_audio_sha256": sha256(args.audio),
            "artifacts": {str(p.relative_to(output)): sha256(p)
                          for p in sorted(output.rglob("*")) if p.is_file()},
        })
        print(f"Saved {output / 'score.abc'}; warnings: {result.get('warnings', [])}")
    except Exception as exc:
        write_json(output / "failure.json", {"status": "failed", "type": type(exc).__name__, "error": str(exc)})
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("--output", type=Path, required=True, help="Fresh output directory")
    parser.add_argument("--task", choices=("full", "melody-full", "melody-vocal"), default="full")
    parser.add_argument("--model", default="m-a-p/SheetSage2")
    parser.add_argument("--revision", help="Pin model and remote code to the same commit")
    parser.add_argument("--base-model", help="Verified MERT-v2-FullSong snapshot for an offline adapter load")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--dtype", choices=("bf16", "fp32"), default="bf16")
    parser.add_argument("--preset", choices=("default", "paper"), default="default")
    parser.add_argument("--max-seconds", type=float, help="Explicitly crop audio; omitted means process the whole input")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--backend", choices=("torch", "mlx"), default="torch")
    args = parser.parse_args()
    try:
        run(args)
        return 0
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
