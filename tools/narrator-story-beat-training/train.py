#!/usr/bin/env python3
"""Offline, developer-only trainer for the manual story-beat narrator task."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import random
import re
import sys
import unicodedata
from collections.abc import Mapping
from pathlib import Path
from typing import Any


CORPUS_SCHEMA_VERSION = 1
RECEIPT_SCHEMA_VERSION = 1
RECEIPT_FILE = "training-receipt.json"
LOG_FILE = "training-log.json"
SEED = 20260904
CPU_THREADS = 4
CPU_INTEROP_THREADS = 1
BATCH_SIZE = 1
GRADIENT_ACCUMULATION_STEPS = 8
EPOCHS = 3
MAX_SOURCE_TOKENS = 320
MAX_TARGET_TOKENS = 32
LEARNING_RATE = 1e-3
GRADIENT_CLIP_NORM = 1.0
NUM_WORKERS = 0
MAX_PROMPT_CHARACTERS = 2400
MAX_TARGET_CHARACTERS = 160
MAX_ID_CHARACTERS = 96
JS_SAFE_INTEGER = 9_007_199_254_740_991

CORPUS_KEYS = frozenset({"schemaVersion", "corpusHash", "cases"})
CASE_KEYS = frozenset({"id", "split", "prompt", "target", "caseHash"})
RECEIPT_KEYS = frozenset({
    "schemaVersion",
    "kind",
    "disposition",
    "source",
    "corpus",
    "recipe",
    "packages",
    "rows",
    "losses",
    "logs",
    "files",
    "modelAdmitted",
    "displayAuthorized",
    "receiptSha256",
})
SOURCE_KEYS = frozenset({"path", "treeSha256", "files"})
CORPUS_EVIDENCE_KEYS = frozenset({"path", "schemaVersion", "corpusHash", "fileSha256"})
RECIPE_KEYS = frozenset({
    "seed",
    "device",
    "batchSize",
    "gradientAccumulationSteps",
    "epochs",
    "maximumSourceTokens",
    "maximumTargetTokens",
    "optimizer",
    "learningRate",
    "relativeStep",
    "scaleParameter",
    "warmupInit",
    "gradientClipNorm",
    "intraopThreads",
    "interopThreads",
    "numWorkers",
    "padding",
    "truncation",
    "shuffle",
})
PACKAGE_KEYS = frozenset({"python", "torch", "transformers", "tokenizers", "safetensors"})
ROW_KEYS = frozenset({"total", "train", "dev"})
LOSS_KEYS = frozenset({"trainByEpoch", "devFinal"})
LOG_KEYS = frozenset({"epoch", "meanTrainLoss", "optimizerSteps"})
FILE_KEYS = frozenset({"path", "byteLength", "sha256"})
ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9._:-]{0,95})$")
HASH16_PATTERN = re.compile(r"^[0-9a-f]{16}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def fail(message: str) -> None:
    raise ValueError(message)


def exact_keys(value: dict[str, Any], expected: frozenset[str], label: str) -> None:
    if set(value) != expected:
        differing = sorted((repr(key) for key in set(value) ^ expected))
        fail(f"{label} keys differ: {differing}")


def canonical(value: Any) -> str:
    """Match src/core/canonical.ts for the corpus' 16-hex integrity hashes."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > JS_SAFE_INTEGER:
            fail("canonical number is outside JavaScript safe-integer range")
        return str(value)
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            fail("canonical object keys must be strings")
        return "{" + ",".join(
            f"{json.dumps(key, ensure_ascii=False)}:{canonical(value[key])}"
            for key in sorted(value)
        ) + "}"
    fail(f"unsupported canonical value: {type(value).__name__}")


def canonical_hash(value: Any) -> str:
    left = 0x811C9DC5
    right = 0x9E3779B9
    source = canonical(value).encode("utf-16-le", "surrogatepass")
    for index in range(0, len(source), 2):
        code = source[index] | (source[index + 1] << 8)
        left = ((left ^ code) * 0x01000193) & 0xFFFFFFFF
        right ^= (
            code
            + 0x9E3779B9
            + ((right << 6) & 0xFFFFFFFF)
            + (right >> 2)
        ) & 0xFFFFFFFF
        right &= 0xFFFFFFFF
    return f"{left:08x}{right:08x}"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stable_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _reject_duplicate_object_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            fail(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json(path: Path, label: str) -> Any:
    try:
        raw = path.read_bytes()
    except OSError as error:
        fail(f"cannot read {label}: {error}")
    try:
        return json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_object_keys,
            parse_constant=lambda token: fail(f"non-finite JSON number: {token}"),
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"invalid {label} JSON: {error}")


def _has_unsafe_unicode(value: str, allow_line_feed: bool) -> bool:
    for scalar in value:
        category = unicodedata.category(scalar)
        if category in {"Cf", "Cs", "Zl", "Zp"}:
            return True
        if category == "Cc" and not (allow_line_feed and scalar == "\n"):
            return True
    return False


def utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le", "surrogatepass")) // 2


def bounded_text(
    value: Any,
    label: str,
    maximum: int,
    *,
    allow_line_feed: bool,
) -> str:
    if not isinstance(value, str):
        fail(f"{label} must be text")
    if not value or utf16_length(value) > maximum:
        fail(f"{label} must contain 1..{maximum} characters")
    if value != value.strip() or value != unicodedata.normalize("NFC", value):
        fail(f"{label} must be trimmed NFC text")
    if _has_unsafe_unicode(value, allow_line_feed):
        fail(f"{label} contains unsafe Unicode")
    if not any(scalar.isalnum() for scalar in value):
        fail(f"{label} must contain a letter or number")
    return value


def case_payload(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": case["id"],
        "split": case["split"],
        "prompt": case["prompt"],
        "target": case["target"],
    }


def corpus_payload(corpus: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": corpus["schemaVersion"],
        "cases": corpus["cases"],
    }


def validate_case(value: Any, index: int) -> dict[str, Any]:
    label = f"cases[{index}]"
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    exact_keys(value, CASE_KEYS, label)
    case_id = value["id"]
    if not isinstance(case_id, str) or not ID_PATTERN.fullmatch(case_id):
        fail(f"{label}.id is invalid")
    if not isinstance(value["split"], str) or value["split"] not in {"train", "dev"}:
        fail(f"{label}.split must be train or dev; sealed holdout rows are forbidden")
    bounded_text(
        value["prompt"],
        f"{label}.prompt",
        MAX_PROMPT_CHARACTERS,
        allow_line_feed=True,
    )
    bounded_text(
        value["target"],
        f"{label}.target",
        MAX_TARGET_CHARACTERS,
        allow_line_feed=False,
    )
    if not isinstance(value["caseHash"], str) or not HASH16_PATTERN.fullmatch(value["caseHash"]):
        fail(f"{label}.caseHash is invalid")
    if value["caseHash"] != canonical_hash(case_payload(value)):
        fail(f"{label}.caseHash differs from canonical payload")
    return value


def validate_corpus(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail("corpus must be an object")
    exact_keys(value, CORPUS_KEYS, "corpus")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != CORPUS_SCHEMA_VERSION:
        fail("unsupported corpus schema version")
    if not isinstance(value["cases"], list) or not value["cases"]:
        fail("corpus.cases must be a non-empty array")
    cases = [validate_case(case, index) for index, case in enumerate(value["cases"])]
    if not isinstance(value["corpusHash"], str) or not HASH16_PATTERN.fullmatch(value["corpusHash"]):
        fail("corpus.corpusHash is invalid")
    if value["corpusHash"] != canonical_hash(corpus_payload(value)):
        fail("corpus.corpusHash differs from canonical payload")

    ids = [case["id"] for case in cases]
    hashes = [case["caseHash"] for case in cases]
    prompts = [case["prompt"] for case in cases]
    pairs = [(case["prompt"], case["target"]) for case in cases]
    if len(ids) != len(set(ids)):
        fail("corpus contains duplicate case ids")
    if len(hashes) != len(set(hashes)):
        fail("corpus contains duplicate case hashes")
    if len(prompts) != len(set(prompts)):
        fail("corpus contains duplicate prompts")
    if len(pairs) != len(set(pairs)):
        fail("corpus contains duplicate prompt/target pairs")
    counts = {split: sum(case["split"] == split for case in cases) for split in ("train", "dev")}
    if counts["train"] == 0 or counts["dev"] == 0:
        fail("corpus must contain at least one train row and one dev row")
    return value


def _raw_path_is_safe(raw: str, label: str) -> None:
    if not raw or "\x00" in raw or "\\" in raw:
        fail(f"{label} path is unsafe")
    path = Path(raw)
    if any(part in {"..", "~"} for part in path.parts):
        fail(f"{label} path traversal is forbidden")


def checked_path(raw: str, label: str) -> Path:
    _raw_path_is_safe(raw, label)
    path = Path(raw)
    absolute = path if path.is_absolute() else Path.cwd() / path
    absolute = Path(os.path.abspath(absolute))
    for candidate in [absolute, *absolute.parents]:
        if candidate.exists() and candidate.is_symlink():
            fail(f"{label} path contains a symlink: {candidate}")
    return absolute


def require_regular_file(path: Path, label: str) -> None:
    if path.is_symlink() or not path.is_file():
        fail(f"{label} must be a regular file")


def regular_file_manifest(root: Path) -> list[dict[str, Any]]:
    if root.is_symlink() or not root.is_dir():
        fail(f"not a regular directory: {root}")
    result: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            fail(f"symlink is forbidden: {path}")
        if path.is_file():
            relative = path.relative_to(root).as_posix()
            result.append({
                "path": relative,
                "byteLength": path.stat().st_size,
                "sha256": sha256_file(path),
            })
    return result


def validate_source(source: Path) -> list[dict[str, Any]]:
    if source.is_symlink() or not source.is_dir():
        fail("source must be a local regular directory")
    manifest = regular_file_manifest(source)
    paths = {item["path"] for item in manifest}
    if "config.json" not in paths:
        fail("source is missing config.json")
    if not ({"tokenizer.json", "spiece.model"} & paths):
        fail("source is missing tokenizer material")
    if any(path.endswith((".bin", ".pt", ".pth")) for path in paths):
        fail("pickle source weights are forbidden; safetensors is required")
    if not any(path.endswith(".safetensors") for path in paths):
        fail("source is missing local safetensors weights")
    return manifest


def validate_fresh_destination(destination: Path) -> None:
    if destination.exists() or destination.is_symlink():
        fail("training destination must be fresh")
    parent = destination.parent
    if parent.is_symlink() or not parent.is_dir():
        fail("training destination parent must be an existing regular directory")
    if destination == Path(destination.anchor):
        fail("training destination cannot be a filesystem root")


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def validate_paths(corpus_path: Path, source: Path, destination: Path) -> None:
    require_regular_file(corpus_path, "corpus")
    validate_fresh_destination(destination)
    if _is_within(destination, source):
        fail("training destination cannot be inside the immutable source")
    if destination == corpus_path or _is_within(corpus_path, destination):
        fail("training destination overlaps the corpus")


def load_corpus(path: Path) -> dict[str, Any]:
    require_regular_file(path, "corpus")
    return validate_corpus(load_json(path, "corpus"))


def _token_ids(tokenizer: Any, text: str) -> list[int]:
    encoded = tokenizer(
        text,
        add_special_tokens=True,
        truncation=False,
        return_attention_mask=False,
    )
    if not isinstance(encoded, Mapping) or "input_ids" not in encoded:
        fail("tokenizer returned an invalid encoding")
    token_ids = encoded["input_ids"]
    if hasattr(token_ids, "tolist"):
        token_ids = token_ids.tolist()
    if (
        not isinstance(token_ids, list)
        or any(isinstance(token, bool) or not isinstance(token, int) for token in token_ids)
    ):
        fail("tokenizer returned invalid token ids")
    if token_ids and isinstance(token_ids[0], list):
        fail("tokenizer unexpectedly returned a batched encoding")
    return token_ids


def tokenize_cases(tokenizer: Any, corpus: dict[str, Any]) -> list[dict[str, Any]]:
    encoded_rows: list[dict[str, Any]] = []
    for case in corpus["cases"]:
        source_ids = _token_ids(tokenizer, case["prompt"])
        target_ids = _token_ids(tokenizer, case["target"])
        if len(source_ids) > MAX_SOURCE_TOKENS:
            fail(
                f"{case['id']} prompt has {len(source_ids)} tokens; "
                f"maximum is {MAX_SOURCE_TOKENS}; truncation is forbidden"
            )
        if len(target_ids) > MAX_TARGET_TOKENS:
            fail(
                f"{case['id']} target has {len(target_ids)} tokens; "
                f"maximum is {MAX_TARGET_TOKENS}; truncation is forbidden"
            )
        encoded_rows.append({
            "id": case["id"],
            "split": case["split"],
            "input_ids": source_ids,
            "labels": target_ids,
        })
    return encoded_rows


def recipe() -> dict[str, Any]:
    return {
        "seed": SEED,
        "device": "cpu",
        "batchSize": BATCH_SIZE,
        "gradientAccumulationSteps": GRADIENT_ACCUMULATION_STEPS,
        "epochs": EPOCHS,
        "maximumSourceTokens": MAX_SOURCE_TOKENS,
        "maximumTargetTokens": MAX_TARGET_TOKENS,
        "optimizer": "Adafactor",
        "learningRate": LEARNING_RATE,
        "relativeStep": False,
        "scaleParameter": False,
        "warmupInit": False,
        "gradientClipNorm": GRADIENT_CLIP_NORM,
        "intraopThreads": CPU_THREADS,
        "interopThreads": CPU_INTEROP_THREADS,
        "numWorkers": NUM_WORKERS,
        "padding": "dynamic-per-batch",
        "truncation": False,
        "shuffle": "seeded-each-epoch",
    }


def enforce_offline_environment() -> None:
    if os.environ.get("PYTHONHASHSEED") != str(SEED):
        fail(f"PYTHONHASHSEED must be {SEED} before Python starts")
    os.environ.update({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "HF_DATASETS_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "TOKENIZERS_PARALLELISM": "false",
        "WANDB_DISABLED": "true",
    })


def emit_epoch_progress(log: dict[str, Any]) -> None:
    print(json.dumps({
        "kind": "story-beat-training-progress",
        "epoch": log["epoch"],
        "epochs": EPOCHS,
        "meanTrainLoss": log["meanTrainLoss"],
        "optimizerSteps": log["optimizerSteps"],
    }, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True), flush=True)


def _file_entry_is_valid(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == FILE_KEYS
        and isinstance(value["path"], str)
        and bool(value["path"])
        and not value["path"].startswith("/")
        and "\\" not in value["path"]
        and all(part not in {"", ".", ".."} for part in Path(value["path"]).parts)
        and isinstance(value["byteLength"], int)
        and not isinstance(value["byteLength"], bool)
        and value["byteLength"] >= 0
        and isinstance(value["sha256"], str)
        and SHA256_PATTERN.fullmatch(value["sha256"]) is not None
    )


def artifact_manifest(destination: Path) -> list[dict[str, Any]]:
    return [
        item for item in regular_file_manifest(destination)
        if item["path"] != RECEIPT_FILE
    ]


def _package_version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        fail(f"required distribution has no version metadata: {name}")


def receipt_payload(receipt: dict[str, Any]) -> dict[str, Any]:
    return {key: receipt[key] for key in receipt if key != "receiptSha256"}


def make_receipt(
    *,
    source: Path,
    source_files: list[dict[str, Any]],
    corpus_path: Path,
    corpus: dict[str, Any],
    destination: Path,
    train_losses: list[float],
    dev_loss: float,
    logs: list[dict[str, Any]],
    package_versions: dict[str, str],
) -> dict[str, Any]:
    counts = {
        split: sum(case["split"] == split for case in corpus["cases"])
        for split in ("train", "dev")
    }
    source_tree_hash = sha256_bytes(stable_json_bytes(source_files))
    payload = {
        "schemaVersion": RECEIPT_SCHEMA_VERSION,
        "kind": "story-beat-cpu-training-receipt",
        "disposition": "developer-artifact-not-runtime-admitted",
        "source": {
            "path": str(source),
            "treeSha256": source_tree_hash,
            "files": source_files,
        },
        "corpus": {
            "path": str(corpus_path),
            "schemaVersion": corpus["schemaVersion"],
            "corpusHash": corpus["corpusHash"],
            "fileSha256": sha256_file(corpus_path),
        },
        "recipe": recipe(),
        "packages": package_versions,
        "rows": {
            "total": len(corpus["cases"]),
            "train": counts["train"],
            "dev": counts["dev"],
        },
        "losses": {
            "trainByEpoch": train_losses,
            "devFinal": dev_loss,
        },
        "logs": logs,
        "files": artifact_manifest(destination),
        "modelAdmitted": False,
        "displayAuthorized": False,
    }
    return {
        **payload,
        "receiptSha256": sha256_bytes(stable_json_bytes(payload)),
    }


def _require_nonnegative_finite(value: Any, label: str) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        fail(f"{label} must be numeric")
    if not math.isfinite(value) or value < 0:
        fail(f"{label} must be finite and non-negative")


def validate_receipt(destination: Path, receipt: Any) -> dict[str, Any]:
    if not isinstance(receipt, dict):
        fail("receipt must be an object")
    exact_keys(receipt, RECEIPT_KEYS, "receipt")
    if type(receipt["schemaVersion"]) is not int or receipt["schemaVersion"] != RECEIPT_SCHEMA_VERSION:
        fail("unsupported receipt schema version")
    if receipt["kind"] != "story-beat-cpu-training-receipt":
        fail("receipt kind differs")
    if receipt["disposition"] != "developer-artifact-not-runtime-admitted":
        fail("receipt disposition differs")
    if receipt["modelAdmitted"] is not False or receipt["displayAuthorized"] is not False:
        fail("training receipt cannot admit a model or authorize display")
    if not isinstance(receipt["receiptSha256"], str) or not SHA256_PATTERN.fullmatch(receipt["receiptSha256"]):
        fail("receipt hash is invalid")
    if receipt["receiptSha256"] != sha256_bytes(stable_json_bytes(receipt_payload(receipt))):
        fail("receipt hash differs")

    source = receipt["source"]
    if not isinstance(source, dict):
        fail("receipt.source must be an object")
    exact_keys(source, SOURCE_KEYS, "receipt.source")
    if not isinstance(source["path"], str) or not source["path"]:
        fail("receipt.source.path is invalid")
    if not isinstance(source["treeSha256"], str) or not SHA256_PATTERN.fullmatch(source["treeSha256"]):
        fail("receipt.source.treeSha256 is invalid")
    if not isinstance(source["files"], list) or not source["files"] or not all(
        _file_entry_is_valid(item) for item in source["files"]
    ):
        fail("receipt.source.files is invalid")
    if source["files"] != sorted(source["files"], key=lambda item: item["path"]):
        fail("receipt.source.files must be sorted")
    if len({item["path"] for item in source["files"]}) != len(source["files"]):
        fail("receipt.source.files contains duplicates")
    if source["treeSha256"] != sha256_bytes(stable_json_bytes(source["files"])):
        fail("receipt source tree hash differs")

    corpus = receipt["corpus"]
    if not isinstance(corpus, dict):
        fail("receipt.corpus must be an object")
    exact_keys(corpus, CORPUS_EVIDENCE_KEYS, "receipt.corpus")
    if (
        not isinstance(corpus["path"], str)
        or not corpus["path"]
        or type(corpus["schemaVersion"]) is not int
        or corpus["schemaVersion"] != CORPUS_SCHEMA_VERSION
        or not isinstance(corpus["corpusHash"], str)
        or not HASH16_PATTERN.fullmatch(corpus["corpusHash"])
        or not isinstance(corpus["fileSha256"], str)
        or not SHA256_PATTERN.fullmatch(corpus["fileSha256"])
    ):
        fail("receipt corpus evidence is invalid")

    if not isinstance(receipt["recipe"], dict):
        fail("receipt.recipe must be an object")
    exact_keys(receipt["recipe"], RECIPE_KEYS, "receipt.recipe")
    if receipt["recipe"] != recipe():
        fail("receipt recipe differs from fixed recipe")

    packages = receipt["packages"]
    if not isinstance(packages, dict):
        fail("receipt.packages must be an object")
    exact_keys(packages, PACKAGE_KEYS, "receipt.packages")
    if any(not isinstance(value, str) or not value for value in packages.values()):
        fail("receipt package versions are invalid")

    rows = receipt["rows"]
    if not isinstance(rows, dict):
        fail("receipt.rows must be an object")
    exact_keys(rows, ROW_KEYS, "receipt.rows")
    if any(isinstance(value, bool) or not isinstance(value, int) or value <= 0 for value in rows.values()):
        fail("receipt row counts are invalid")
    if rows["total"] != rows["train"] + rows["dev"]:
        fail("receipt row counts do not add up")

    losses = receipt["losses"]
    if not isinstance(losses, dict):
        fail("receipt.losses must be an object")
    exact_keys(losses, LOSS_KEYS, "receipt.losses")
    if not isinstance(losses["trainByEpoch"], list) or len(losses["trainByEpoch"]) != EPOCHS:
        fail("receipt train losses differ from fixed epoch count")
    for index, value in enumerate(losses["trainByEpoch"]):
        _require_nonnegative_finite(value, f"receipt.losses.trainByEpoch[{index}]")
    _require_nonnegative_finite(losses["devFinal"], "receipt.losses.devFinal")

    logs = receipt["logs"]
    if not isinstance(logs, list) or len(logs) != EPOCHS:
        fail("receipt logs differ from fixed epoch count")
    previous_steps = 0
    steps_per_epoch = math.ceil(rows["train"] / GRADIENT_ACCUMULATION_STEPS)
    for index, entry in enumerate(logs):
        if not isinstance(entry, dict):
            fail(f"receipt.logs[{index}] must be an object")
        exact_keys(entry, LOG_KEYS, f"receipt.logs[{index}]")
        if entry["epoch"] != index + 1:
            fail("receipt log epochs are not consecutive")
        _require_nonnegative_finite(entry["meanTrainLoss"], f"receipt.logs[{index}].meanTrainLoss")
        if (
            isinstance(entry["optimizerSteps"], bool)
            or not isinstance(entry["optimizerSteps"], int)
            or entry["optimizerSteps"] <= previous_steps
            or entry["optimizerSteps"] != steps_per_epoch * (index + 1)
        ):
            fail("receipt optimizer step counts are invalid")
        previous_steps = entry["optimizerSteps"]
        if entry["meanTrainLoss"] != losses["trainByEpoch"][index]:
            fail("receipt logs and losses differ")

    files = receipt["files"]
    if not isinstance(files, list) or not files or not all(_file_entry_is_valid(item) for item in files):
        fail("receipt.files is invalid")
    if files != sorted(files, key=lambda item: item["path"]):
        fail("receipt.files must be sorted")
    if len({item["path"] for item in files}) != len(files):
        fail("receipt.files contains duplicates")
    observed = artifact_manifest(destination)
    if files != observed:
        fail("receipt artifact closure, sizes, or hashes differ")
    paths = {item["path"] for item in files}
    if "config.json" not in paths or LOG_FILE not in paths:
        fail("receipt is missing configuration or training log")
    if not any(path.endswith(".safetensors") for path in paths):
        fail("receipt is missing safetensors weights")
    if not ({"tokenizer.json", "spiece.model"} & paths):
        fail("receipt is missing tokenizer material")
    if any(path.endswith((".bin", ".pt", ".pth")) for path in paths):
        fail("pickle model artifacts are forbidden")
    return receipt


def _write_json(path: Path, value: Any) -> None:
    encoded = json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    path.write_text(encoded, encoding="utf-8")


def run_training(
    corpus_path: Path,
    source: Path,
    destination: Path,
    corpus: dict[str, Any],
    source_files: list[dict[str, Any]],
) -> dict[str, Any]:
    enforce_offline_environment()

    # Keep all heavyweight or optional training imports out of validation-only mode.
    import torch
    from torch.utils.data import DataLoader
    from transformers import Adafactor, AutoModelForSeq2SeqLM, AutoTokenizer

    random.seed(SEED)
    torch.manual_seed(SEED)
    torch.set_num_threads(CPU_THREADS)
    torch.set_num_interop_threads(CPU_INTEROP_THREADS)
    torch.use_deterministic_algorithms(True)

    tokenizer = AutoTokenizer.from_pretrained(
        str(source),
        local_files_only=True,
        trust_remote_code=False,
    )
    encoded_rows = tokenize_cases(tokenizer, corpus)
    train_rows = [row for row in encoded_rows if row["split"] == "train"]
    dev_rows = [row for row in encoded_rows if row["split"] == "dev"]

    model = AutoModelForSeq2SeqLM.from_pretrained(
        str(source),
        local_files_only=True,
        trust_remote_code=False,
    ).to(torch.device("cpu"))
    prior_use_cache = getattr(model.config, "use_cache", True)
    model.config.use_cache = False

    def collate(rows: list[dict[str, Any]]) -> dict[str, Any]:
        inputs = tokenizer.pad(
            [{"input_ids": row["input_ids"]} for row in rows],
            padding=True,
            return_tensors="pt",
        )
        targets = tokenizer.pad(
            [{"input_ids": row["labels"]} for row in rows],
            padding=True,
            return_tensors="pt",
        )["input_ids"]
        labels = targets.masked_fill(targets == tokenizer.pad_token_id, -100)
        return {
            "input_ids": inputs["input_ids"],
            "attention_mask": inputs["attention_mask"],
            "labels": labels,
        }

    generator = torch.Generator(device="cpu")
    generator.manual_seed(SEED)
    train_loader = DataLoader(
        train_rows,
        batch_size=BATCH_SIZE,
        shuffle=True,
        generator=generator,
        num_workers=NUM_WORKERS,
        collate_fn=collate,
    )
    dev_loader = DataLoader(
        dev_rows,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=NUM_WORKERS,
        collate_fn=collate,
    )
    optimizer = Adafactor(
        model.parameters(),
        lr=LEARNING_RATE,
        relative_step=False,
        scale_parameter=False,
        warmup_init=False,
    )

    train_losses: list[float] = []
    logs: list[dict[str, Any]] = []
    optimizer_steps = 0
    for epoch in range(EPOCHS):
        model.train()
        epoch_loss = 0.0
        row_count = 0
        rows_in_group = 0
        group_size = min(GRADIENT_ACCUMULATION_STEPS, len(train_rows))
        optimizer.zero_grad(set_to_none=True)
        for batch_index, batch in enumerate(train_loader):
            if rows_in_group == 0:
                remaining = len(train_rows) - batch_index
                group_size = min(GRADIENT_ACCUMULATION_STEPS, remaining)
            outputs = model(**{key: value.to("cpu") for key, value in batch.items()})
            loss = outputs.loss
            observed_loss = float(loss.detach().cpu())
            if not math.isfinite(observed_loss):
                fail(f"non-finite training loss at epoch {epoch + 1}")
            epoch_loss += observed_loss
            row_count += batch["input_ids"].shape[0]
            rows_in_group += 1
            (loss / group_size).backward()
            if rows_in_group == group_size:
                torch.nn.utils.clip_grad_norm_(model.parameters(), GRADIENT_CLIP_NORM)
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
                optimizer_steps += 1
                rows_in_group = 0
        mean_loss = epoch_loss / row_count
        train_losses.append(mean_loss)
        logs.append({
            "epoch": epoch + 1,
            "meanTrainLoss": mean_loss,
            "optimizerSteps": optimizer_steps,
        })
        emit_epoch_progress(logs[-1])

    model.eval()
    dev_total = 0.0
    dev_rows_seen = 0
    with torch.no_grad():
        for batch in dev_loader:
            outputs = model(**{key: value.to("cpu") for key, value in batch.items()})
            observed_loss = float(outputs.loss.detach().cpu())
            if not math.isfinite(observed_loss):
                fail("non-finite dev loss")
            count = batch["input_ids"].shape[0]
            dev_total += observed_loss * count
            dev_rows_seen += count
    dev_loss = dev_total / dev_rows_seen

    if validate_source(source) != source_files:
        fail("source closure changed during training")
    if load_corpus(corpus_path) != corpus:
        fail("corpus changed during training")
    validate_fresh_destination(destination)
    destination.mkdir()
    model.config.use_cache = prior_use_cache
    model.save_pretrained(destination, safe_serialization=True)
    tokenizer.save_pretrained(destination)
    _write_json(destination / LOG_FILE, {
        "schemaVersion": 1,
        "seed": SEED,
        "trainByEpoch": train_losses,
        "devFinal": dev_loss,
        "epochs": logs,
    })

    package_versions = {
        "python": platform.python_version(),
        "torch": _package_version("torch"),
        "transformers": _package_version("transformers"),
        "tokenizers": _package_version("tokenizers"),
        "safetensors": _package_version("safetensors"),
    }
    receipt = make_receipt(
        source=source,
        source_files=source_files,
        corpus_path=corpus_path,
        corpus=corpus,
        destination=destination,
        train_losses=train_losses,
        dev_loss=dev_loss,
        logs=logs,
        package_versions=package_versions,
    )
    validate_receipt(destination, receipt)
    _write_json(destination / RECEIPT_FILE, receipt)
    validate_receipt(destination, load_json(destination / RECEIPT_FILE, "receipt"))
    return receipt


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", required=True, help="sealed train/dev JSON corpus")
    parser.add_argument("--source", required=True, help="local pretrained model directory")
    parser.add_argument("--destination", required=True, help="fresh output directory")
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="validate schema, hashes, source closure, and paths without importing ML packages",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    corpus_path = checked_path(args.corpus, "corpus")
    source = checked_path(args.source, "source")
    destination = checked_path(args.destination, "destination")
    validate_paths(corpus_path, source, destination)
    corpus = load_corpus(corpus_path)
    source_files = validate_source(source)
    if args.validate_only:
        counts = {
            split: sum(case["split"] == split for case in corpus["cases"])
            for split in ("train", "dev")
        }
        print(json.dumps({
            "schemaVersion": CORPUS_SCHEMA_VERSION,
            "corpusHash": corpus["corpusHash"],
            "rows": {"total": len(corpus["cases"]), **counts},
            "sourceFiles": len(source_files),
            "destinationFresh": True,
            "mlPackagesImported": False,
        }, sort_keys=True))
        return 0
    run_training(corpus_path, source, destination, corpus, source_files)
    print(destination / RECEIPT_FILE)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"story-beat training refused: {error}", file=sys.stderr)
        raise SystemExit(2)
