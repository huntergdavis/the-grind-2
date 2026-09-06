#!/usr/bin/env python3
"""Offline, developer-only CPU trainer for factual story-beat V2."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path
from types import ModuleType
from typing import Any


CORE_PATH = (
    Path(__file__).resolve().parent.parent
    / "narrator-story-beat-training"
    / "train.py"
)
CORE_SHA256 = "459fab2643c1d2bc328606ebcfa6adfd4ec278575d6c99327ab2ef242569ef79"
CORPUS_SCHEMA_VERSION = 2
RECEIPT_SCHEMA_VERSION = 2
SEED = 20260906
MAX_SOURCE_TOKENS = 384
MAX_TARGET_TOKENS = 48
MAX_ID_CHARACTERS = 160
MAX_PROMPT_CHARACTERS = 2_400
MAX_TARGET_CHARACTERS = 160


def fail(message: str) -> None:
    raise ValueError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
    except OSError as error:
        fail(f"cannot read pinned trainer core: {error}")
    return digest.hexdigest()


def verify_core(
    path: Path = CORE_PATH,
    expected_sha256: str = CORE_SHA256,
) -> None:
    if path.is_symlink() or not path.is_file():
        fail("pinned trainer core must be a regular file")
    if sha256_file(path) != expected_sha256:
        fail("pinned trainer core SHA-256 differs")


def load_core() -> ModuleType:
    verify_core()
    spec = importlib.util.spec_from_file_location(
        "_grind2_factual_story_beat_v2_training_core",
        CORE_PATH,
    )
    if spec is None or spec.loader is None:
        fail("cannot load pinned trainer core")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_core = load_core()
_core.CORPUS_SCHEMA_VERSION = CORPUS_SCHEMA_VERSION
_core.RECEIPT_SCHEMA_VERSION = RECEIPT_SCHEMA_VERSION
_core.SEED = SEED
_core.MAX_SOURCE_TOKENS = MAX_SOURCE_TOKENS
_core.MAX_TARGET_TOKENS = MAX_TARGET_TOKENS
_core.MAX_ID_CHARACTERS = MAX_ID_CHARACTERS
_core.MAX_PROMPT_CHARACTERS = MAX_PROMPT_CHARACTERS
_core.MAX_TARGET_CHARACTERS = MAX_TARGET_CHARACTERS
_core.ID_PATTERN = re.compile(
    rf"^[a-z0-9](?:[a-z0-9._:-]{{0,{MAX_ID_CHARACTERS - 1}}})$"
)

RECEIPT_FILE = _core.RECEIPT_FILE
LOG_FILE = _core.LOG_FILE
EPOCHS = _core.EPOCHS
GRADIENT_ACCUMULATION_STEPS = _core.GRADIENT_ACCUMULATION_STEPS

canonical = _core.canonical
canonical_hash = _core.canonical_hash
stable_json_bytes = _core.stable_json_bytes
sha256_bytes = _core.sha256_bytes
load_json = _core.load_json
utf16_length = _core.utf16_length
bounded_text = _core.bounded_text
checked_path = _core.checked_path
validate_fresh_destination = _core.validate_fresh_destination
validate_paths = _core.validate_paths
validate_source = _core.validate_source
validate_corpus = _core.validate_corpus
load_corpus = _core.load_corpus
tokenize_cases = _core.tokenize_cases
enforce_offline_environment = _core.enforce_offline_environment
make_receipt = _core.make_receipt
validate_receipt = _core.validate_receipt


def recipe() -> dict[str, Any]:
    return _core.recipe()


def emit_epoch_progress(log: dict[str, Any]) -> None:
    print(json.dumps({
        "kind": "factual-story-beat-v2-training-progress",
        "epoch": log["epoch"],
        "epochs": EPOCHS,
        "meanTrainLoss": log["meanTrainLoss"],
        "optimizerSteps": log["optimizerSteps"],
    }, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True), flush=True)


_core.emit_epoch_progress = emit_epoch_progress


def run_training(
    corpus_path: Path,
    source: Path,
    destination: Path,
    corpus: dict[str, Any],
    source_files: list[dict[str, Any]],
) -> dict[str, Any]:
    return _core.run_training(
        corpus_path,
        source,
        destination,
        corpus,
        source_files,
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--corpus",
        required=True,
        help="sealed factual V2 train/dev JSON corpus",
    )
    parser.add_argument(
        "--source",
        required=True,
        help="local pretrained model directory",
    )
    parser.add_argument(
        "--destination",
        required=True,
        help="fresh output directory",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help=(
            "validate V2 schema, hashes, source closure, and paths without "
            "importing ML packages"
        ),
    )
    return parser.parse_args(argv)


def validation_summary(
    corpus: dict[str, Any],
    source_files: list[dict[str, Any]],
) -> dict[str, Any]:
    counts = {
        split: sum(case["split"] == split for case in corpus["cases"])
        for split in ("train", "dev")
    }
    return {
        "schemaVersion": CORPUS_SCHEMA_VERSION,
        "corpusHash": corpus["corpusHash"],
        "rows": {"total": len(corpus["cases"]), **counts},
        "profile": {
            "coreSha256": CORE_SHA256,
            "seed": SEED,
            "maximumSourceTokens": MAX_SOURCE_TOKENS,
            "maximumTargetTokens": MAX_TARGET_TOKENS,
        },
        "sourceFiles": len(source_files),
        "destinationFresh": True,
        "mlPackagesImported": False,
        "modelAdmitted": False,
        "displayAuthorized": False,
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    corpus_path = checked_path(args.corpus, "corpus")
    source = checked_path(args.source, "source")
    destination = checked_path(args.destination, "destination")
    validate_paths(corpus_path, source, destination)
    corpus = load_corpus(corpus_path)
    source_files = validate_source(source)
    if args.validate_only:
        print(json.dumps(validation_summary(corpus, source_files), sort_keys=True))
        return 0
    run_training(corpus_path, source, destination, corpus, source_files)
    print(destination / RECEIPT_FILE)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"factual story-beat V2 training refused: {error}", file=sys.stderr)
        raise SystemExit(2)
