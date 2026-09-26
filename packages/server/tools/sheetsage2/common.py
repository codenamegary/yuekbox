# Vendored from YuE (https://github.com/multimodal-art-projection/YuE) revision
# bd90e4ccae671d869b3ecaca6d7e893927d29442, skills/yue2-music/scripts/common.py.
# Apache-2.0; see the upstream LICENSE. Vendored verbatim: yuekbox owns this copy
# and its contract. Installed flat beside transcribe.py and abc_tools.py.
"""Small standard-library helpers shared by the portable command-line tools."""

import hashlib
import json
from fractions import Fraction
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    def encode(item):
        if isinstance(item, Fraction):
            return str(item)
        raise TypeError(f"Unsupported JSON value: {type(item).__name__}")

    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2,
                                    allow_nan=False, default=encode) + "\n", encoding="utf-8")


def fresh_directory(path):
    path = Path(path)
    path.mkdir(parents=True, exist_ok=False)
    return path
