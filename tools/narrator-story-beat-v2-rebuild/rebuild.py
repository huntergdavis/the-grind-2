#!/usr/bin/env python3
"""Offline, developer-only q8 rebuild wrapper for factual story-beat V2."""

from __future__ import annotations

import hashlib
import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any


SCRIPT_PATH = Path(__file__).absolute()
REPOSITORY_ROOT = SCRIPT_PATH.parents[2]
CORE_PATH = (
    SCRIPT_PATH.parent.parent
    / "narrator-story-beat-rebuild"
    / "rebuild.py"
)
CORE_SHA256 = "90bd5e8b3323aa17643fb11e1f899dbed8678f817897d8df3619b63f9a2d4e31"
TRAINING_HARNESS_RELATIVE = "tools/narrator-story-beat-v2-training/train.py"
TRAINING_HARNESS_SHA256 = (
    "5d0573f2aa9eb0ddd88589e8f90db37451395b572961af23a5c3a0c654f0ec98"
)
DERIVED_HARNESS_RELATIVE = "tools/narrator-story-beat-v2-rebuild/rebuild.py"
SCHEMA_VERSION = 2
LOCK_KIND = "factual-story-beat-v2-derived-q8-rebuild-lock"
RECEIPT_KIND = "factual-story-beat-v2-derived-q8-rebuild-receipt"


def fail(message: str) -> None:
    raise ValueError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
    except OSError as error:
        fail(f"cannot read pinned rebuild dependency: {error}")
    return digest.hexdigest()


def _load_pinned(path: Path, name: str, expected_sha256: str) -> ModuleType:
    if path.is_symlink() or not path.is_file():
        fail("pinned rebuild dependency must be a regular file")
    if sha256_file(path) != expected_sha256:
        fail("pinned rebuild dependency SHA-256 differs")
    specification = importlib.util.spec_from_file_location(name, path)
    if specification is None or specification.loader is None:
        fail("cannot load pinned rebuild dependency")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def verify_core(
    path: Path = CORE_PATH,
    expected_sha256: str = CORE_SHA256,
) -> None:
    _load_pinned(path, "_grind2_factual_v2_rebuild_core_probe", expected_sha256)


_core = _load_pinned(
    CORE_PATH,
    "_grind2_factual_story_beat_v2_rebuild_core",
    CORE_SHA256,
)
TRAINER = _load_pinned(
    REPOSITORY_ROOT / TRAINING_HARNESS_RELATIVE,
    "_grind2_factual_story_beat_v2_rebuild_trainer",
    TRAINING_HARNESS_SHA256,
)

# The proven core resolves these names at call time. Override only the additive
# V2 profile; its historical converter and every validation guard stay pinned.
_core.SCRIPT_PATH = SCRIPT_PATH
_core.REPOSITORY_ROOT = REPOSITORY_ROOT
_core.SCHEMA_VERSION = SCHEMA_VERSION
_core.LOCK_KIND = LOCK_KIND
_core.RECEIPT_KIND = RECEIPT_KIND
_core.TRAINING_HARNESS_RELATIVE = TRAINING_HARNESS_RELATIVE
_core.DERIVED_HARNESS_RELATIVE = DERIVED_HARNESS_RELATIVE
_core.TRAINER = TRAINER

BASE_LOCK_RELATIVE = _core.BASE_LOCK_RELATIVE
BASE_HARNESS_RELATIVE = _core.BASE_HARNESS_RELATIVE
TRAINING_RECEIPT = _core.TRAINING_RECEIPT
TRUSTED_BASE_LOCK_SHA256 = _core.TRUSTED_BASE_LOCK_SHA256
TRUSTED_BASE_HARNESS_SHA256 = _core.TRUSTED_BASE_HARNESS_SHA256
VALIDATOR_TRUST_BOUNDARY = _core.VALIDATOR_TRUST_BOUNDARY

checked_path = _core.checked_path
regular_file_manifest = _core.regular_file_manifest
locked_package_version = _core.locked_package_version
create_lock = _core.create_lock
verify_bundle = _core.verify_bundle
build_one = _core.build_one
observe_pair = _core.observe_pair
verify_pair = _core.verify_pair
parse_args = _core.parse_args


def profile() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "lockKind": LOCK_KIND,
        "receiptKind": RECEIPT_KIND,
        "coreSha256": CORE_SHA256,
        "trainingHarness": {
            "path": TRAINING_HARNESS_RELATIVE,
            "sha256": TRAINING_HARNESS_SHA256,
        },
        "derivedHarness": DERIVED_HARNESS_RELATIVE,
        "importedHistoricalFunctions": ["build_once", "observed_run"],
        "modelAdmitted": False,
        "displayAuthorized": False,
    }


def main(argv: list[str] | None = None) -> int:
    return _core.main(sys.argv[1:] if argv is None else argv)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"factual story-beat V2 derived rebuild refused: {error}", file=sys.stderr)
        raise SystemExit(2)
