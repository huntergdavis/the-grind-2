#!/usr/bin/env python3
"""Generate hash-bound, developer-only evidence from the sealed story-beat holdout."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
import unicodedata
from collections.abc import Mapping
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
SEED = 20260904
CPU_THREADS = 4
CPU_INTEROP_THREADS = 1
HOLDOUT_CASE_COUNT = 200
MAX_SOURCE_TOKENS = 320
MAX_NEW_TOKENS = 48
CLEAN_UP_TOKENIZATION_SPACES = False
MAX_PROMPT_CHARACTERS = 2400
MAX_TARGET_CHARACTERS = 160
MAX_EVIDENCE_OUTPUT_CHARACTERS = 4096
JS_SAFE_INTEGER = 9_007_199_254_740_991

CORPUS_KEYS = frozenset({"schemaVersion", "corpusHash", "cases"})
CASE_KEYS = frozenset({"id", "split", "prompt", "target", "caseHash"})
FILE_KEYS = frozenset({"path", "byteLength", "sha256"})
CONTRACT_KEYS = frozenset({
    "seed",
    "device",
    "dtype",
    "offline",
    "deterministicAlgorithms",
    "intraopThreads",
    "interopThreads",
    "maximumInputTokens",
    "maximumNewTokens",
    "doSample",
    "numBeams",
    "numReturnSequences",
    "cleanUpTokenizationSpaces",
})
MODEL_KEYS = frozenset({"path", "treeSha256", "files"})
HOLDOUT_KEYS = frozenset({
    "path",
    "schemaVersion",
    "corpusHash",
    "fileSha256",
    "caseCount",
})
SELECTION_KEYS = frozenset({
    "method",
    "requestedCaseCount",
    "selectedCaseCount",
    "selectedIdsHash",
})
ROW_KEYS = frozenset({
    "ordinal",
    "sourceOrdinal",
    "id",
    "caseHash",
    "selectionRankHash",
    "promptSha256",
    "referenceTargetSha256",
    "inputTokenCount",
    "generatedTokenCount",
    "output",
    "outputSha256",
    "elapsedMicroseconds",
    "rowHash",
})
SUMMARY_KEYS = frozenset({"rowCount", "totalElapsedMicroseconds"})
EVIDENCE_KEYS = frozenset({
    "schemaVersion",
    "kind",
    "disposition",
    "contract",
    "model",
    "holdout",
    "selection",
    "rows",
    "summary",
    "modelAdmitted",
    "displayAuthorized",
    "contentHash",
})

ID_PATTERN = re.compile(r"^story-beat-training-corpus-v1:holdout:\d{4}$")
HASH16_PATTERN = re.compile(r"^[0-9a-f]{16}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def fail(message: str) -> None:
    raise ValueError(message)


def exact_keys(value: dict[str, Any], expected: frozenset[str], label: str) -> None:
    if set(value) != expected:
        differing = sorted(repr(key) for key in set(value) ^ expected)
        fail(f"{label} keys differ: {differing}")


def canonical(value: Any) -> str:
    """Match src/core/canonical.ts and export-corpus.mjs exactly."""
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


def sha256_text(value: str) -> str:
    return sha256_bytes(value.encode("utf-8"))


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


def utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le", "surrogatepass")) // 2


def _has_unsafe_unicode(value: str, allow_line_feed: bool) -> bool:
    for scalar in value:
        category = unicodedata.category(scalar)
        if category in {"Cf", "Cs", "Zl", "Zp"}:
            return True
        if category == "Cc" and not (allow_line_feed and scalar == "\n"):
            return True
    return False


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
    return {"schemaVersion": corpus["schemaVersion"], "cases": corpus["cases"]}


def validate_holdout_case(value: Any, index: int) -> dict[str, Any]:
    label = f"cases[{index}]"
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    exact_keys(value, CASE_KEYS, label)
    if not isinstance(value["id"], str) or not ID_PATTERN.fullmatch(value["id"]):
        fail(f"{label}.id is invalid")
    if value["split"] != "holdout":
        fail(f"{label}.split must be holdout; train/dev rows are forbidden")
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


def validate_holdout(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail("holdout must be an object")
    exact_keys(value, CORPUS_KEYS, "holdout")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != SCHEMA_VERSION:
        fail("unsupported holdout schema version")
    if not isinstance(value["cases"], list) or len(value["cases"]) != HOLDOUT_CASE_COUNT:
        fail(f"holdout must contain exactly {HOLDOUT_CASE_COUNT} cases")
    cases = [
        validate_holdout_case(case, index)
        for index, case in enumerate(value["cases"])
    ]
    if not isinstance(value["corpusHash"], str) or not HASH16_PATTERN.fullmatch(value["corpusHash"]):
        fail("holdout.corpusHash is invalid")
    if value["corpusHash"] != canonical_hash(corpus_payload(value)):
        fail("holdout.corpusHash differs from canonical payload")
    for label, values in (
        ("ids", [case["id"] for case in cases]),
        ("case hashes", [case["caseHash"] for case in cases]),
        ("prompts", [case["prompt"] for case in cases]),
    ):
        if len(values) != len(set(values)):
            fail(f"holdout contains duplicate {label}")
    return value


def _raw_path_is_safe(raw: str, label: str) -> None:
    if not raw or "\x00" in raw or "\\" in raw:
        fail(f"{label} path is unsafe")
    path = Path(raw)
    if any(part in {"", ".", "..", "~"} for part in path.parts[1:] if path.is_absolute()):
        fail(f"{label} path traversal is forbidden")
    if any(part in {".", "..", "~"} for part in path.parts if not path.is_absolute()):
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
        if path.is_dir():
            continue
        if path.is_file():
            result.append({
                "path": path.relative_to(root).as_posix(),
                "byteLength": path.stat().st_size,
                "sha256": sha256_file(path),
            })
            continue
        fail(f"non-regular model entry is forbidden: {path}")
    return result


def validate_model(model: Path) -> list[dict[str, Any]]:
    if model.is_symlink() or not model.is_dir():
        fail("model must be a local regular directory")
    manifest = regular_file_manifest(model)
    paths = {item["path"] for item in manifest}
    if "config.json" not in paths:
        fail("model is missing config.json")
    if not ({"tokenizer.json", "spiece.model"} & paths):
        fail("model is missing tokenizer material")
    if any(path.endswith((".bin", ".pt", ".pth")) for path in paths):
        fail("pickle model weights are forbidden; safetensors is required")
    if not any(path.endswith(".safetensors") for path in paths):
        fail("model is missing local safetensors weights")
    return manifest


def validate_fresh_output(output: Path) -> None:
    if output.exists() or output.is_symlink():
        fail("evaluation output must be a fresh JSON file")
    if output.suffix != ".json":
        fail("evaluation output must use a .json suffix")
    parent = output.parent
    if parent.is_symlink() or not parent.is_dir():
        fail("evaluation output parent must be an existing regular directory")
    if output == Path(output.anchor):
        fail("evaluation output cannot be a filesystem root")


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def validate_paths(holdout_path: Path, model: Path, output: Path) -> None:
    require_regular_file(holdout_path, "holdout")
    validate_fresh_output(output)
    if _is_within(output, model):
        fail("evaluation output cannot be inside the immutable model")
    if output == holdout_path or _is_within(holdout_path, output):
        fail("evaluation output overlaps the holdout")


def load_holdout(path: Path) -> dict[str, Any]:
    require_regular_file(path, "holdout")
    return validate_holdout(load_json(path, "holdout"))


def generation_contract() -> dict[str, Any]:
    return {
        "seed": SEED,
        "device": "cpu",
        "dtype": "float32",
        "offline": True,
        "deterministicAlgorithms": True,
        "intraopThreads": CPU_THREADS,
        "interopThreads": CPU_INTEROP_THREADS,
        "maximumInputTokens": MAX_SOURCE_TOKENS,
        "maximumNewTokens": MAX_NEW_TOKENS,
        "doSample": False,
        "numBeams": 1,
        "numReturnSequences": 1,
        "cleanUpTokenizationSpaces": CLEAN_UP_TOKENIZATION_SPACES,
    }


def selection_rank(case: dict[str, Any]) -> str:
    return canonical_hash({
        "schemaVersion": SCHEMA_VERSION,
        "purpose": "story-beat-heldout-selection-v1",
        "seed": SEED,
        "id": case["id"],
        "caseHash": case["caseHash"],
    })


def select_cases(
    holdout: dict[str, Any],
    requested_case_count: int,
) -> tuple[list[tuple[int, dict[str, Any], str]], dict[str, Any]]:
    if (
        isinstance(requested_case_count, bool)
        or not isinstance(requested_case_count, int)
        or requested_case_count < 1
        or requested_case_count > HOLDOUT_CASE_COUNT
    ):
        fail(f"case count must be within 1..{HOLDOUT_CASE_COUNT}")
    ranked = sorted(
        (
            (source_ordinal, case, selection_rank(case))
            for source_ordinal, case in enumerate(holdout["cases"])
        ),
        key=lambda entry: (entry[2], entry[1]["id"]),
    )
    selected = ranked[:requested_case_count]
    selection = {
        "method": "canonical-rank-v1",
        "requestedCaseCount": requested_case_count,
        "selectedCaseCount": len(selected),
        "selectedIdsHash": canonical_hash([entry[1]["id"] for entry in selected]),
    }
    return selected, selection


def model_evidence(model: Path, files: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "path": str(model),
        "treeSha256": sha256_bytes(stable_json_bytes(files)),
        "files": files,
    }


def holdout_evidence(path: Path, holdout: dict[str, Any]) -> dict[str, Any]:
    return {
        "path": str(path),
        "schemaVersion": holdout["schemaVersion"],
        "corpusHash": holdout["corpusHash"],
        "fileSha256": sha256_file(path),
        "caseCount": len(holdout["cases"]),
    }


def make_result_row(
    *,
    ordinal: int,
    source_ordinal: int,
    case: dict[str, Any],
    rank_hash: str,
    input_token_count: int,
    generated_token_count: int,
    output: str,
    elapsed_microseconds: int,
) -> dict[str, Any]:
    payload = {
        "ordinal": ordinal,
        "sourceOrdinal": source_ordinal,
        "id": case["id"],
        "caseHash": case["caseHash"],
        "selectionRankHash": rank_hash,
        "promptSha256": sha256_text(case["prompt"]),
        "referenceTargetSha256": sha256_text(case["target"]),
        "inputTokenCount": input_token_count,
        "generatedTokenCount": generated_token_count,
        "output": output,
        "outputSha256": sha256_text(output),
        "elapsedMicroseconds": elapsed_microseconds,
    }
    return {**payload, "rowHash": canonical_hash(payload)}


def evidence_payload(evidence: dict[str, Any]) -> dict[str, Any]:
    return {key: evidence[key] for key in evidence if key != "contentHash"}


def build_evidence(
    *,
    model: Path,
    model_files: list[dict[str, Any]],
    holdout_path: Path,
    holdout: dict[str, Any],
    selection: dict[str, Any],
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "story-beat-heldout-generation",
        "disposition": "developer-evidence-not-runtime-admitted",
        "contract": generation_contract(),
        "model": model_evidence(model, model_files),
        "holdout": holdout_evidence(holdout_path, holdout),
        "selection": selection,
        "rows": rows,
        "summary": {
            "rowCount": len(rows),
            "totalElapsedMicroseconds": sum(row["elapsedMicroseconds"] for row in rows),
        },
        "modelAdmitted": False,
        "displayAuthorized": False,
    }
    return {**payload, "contentHash": canonical_hash(payload)}


def _valid_file_entry(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == FILE_KEYS
        and isinstance(value["path"], str)
        and bool(value["path"])
        and not value["path"].startswith("/")
        and "\\" not in value["path"]
        and all(part not in {"", ".", ".."} for part in Path(value["path"]).parts)
        and type(value["byteLength"]) is int
        and 0 <= value["byteLength"] <= JS_SAFE_INTEGER
        and isinstance(value["sha256"], str)
        and SHA256_PATTERN.fullmatch(value["sha256"]) is not None
    )


def _safe_integer(value: Any, minimum: int, maximum: int, label: str) -> int:
    if type(value) is not int or value < minimum or value > maximum:
        fail(f"{label} must be a safe integer within {minimum}..{maximum}")
    return value


def _validate_evidence_output(value: Any, label: str) -> str:
    if not isinstance(value, str):
        fail(f"{label} must be one string")
    if utf16_length(value) > MAX_EVIDENCE_OUTPUT_CHARACTERS:
        fail(f"{label} exceeds the evidence character ceiling")
    if value != unicodedata.normalize("NFC", value):
        fail(f"{label} must be NFC text")
    if any(unicodedata.category(scalar) == "Cs" for scalar in value):
        fail(f"{label} contains a surrogate")
    return value


def validate_evidence(
    value: Any,
    *,
    model: Path | None = None,
    model_files: list[dict[str, Any]] | None = None,
    holdout_path: Path | None = None,
    holdout: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail("evaluation evidence must be an object")
    exact_keys(value, EVIDENCE_KEYS, "evaluation evidence")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != SCHEMA_VERSION:
        fail("unsupported evaluation evidence schema version")
    if value["kind"] != "story-beat-heldout-generation":
        fail("evaluation evidence kind differs")
    if value["disposition"] != "developer-evidence-not-runtime-admitted":
        fail("evaluation evidence disposition differs")
    if value["modelAdmitted"] is not False or value["displayAuthorized"] is not False:
        fail("evaluation evidence cannot admit a model or authorize display")
    if not isinstance(value["contentHash"], str) or not HASH16_PATTERN.fullmatch(value["contentHash"]):
        fail("evaluation evidence content hash is invalid")
    if value["contentHash"] != canonical_hash(evidence_payload(value)):
        fail("evaluation evidence content hash differs")

    contract = value["contract"]
    if not isinstance(contract, dict):
        fail("evaluation evidence contract must be an object")
    exact_keys(contract, CONTRACT_KEYS, "evaluation evidence contract")
    if contract != generation_contract():
        fail("evaluation evidence generation contract differs")

    model_value = value["model"]
    if not isinstance(model_value, dict):
        fail("evaluation evidence model must be an object")
    exact_keys(model_value, MODEL_KEYS, "evaluation evidence model")
    if not isinstance(model_value["path"], str) or not model_value["path"]:
        fail("evaluation evidence model path is invalid")
    if not isinstance(model_value["treeSha256"], str) or not SHA256_PATTERN.fullmatch(model_value["treeSha256"]):
        fail("evaluation evidence model tree hash is invalid")
    files = model_value["files"]
    if not isinstance(files, list) or not files or not all(_valid_file_entry(item) for item in files):
        fail("evaluation evidence model files are invalid")
    if files != sorted(files, key=lambda item: item["path"]):
        fail("evaluation evidence model files must be sorted")
    if len({item["path"] for item in files}) != len(files):
        fail("evaluation evidence model files contain duplicates")
    if model_value["treeSha256"] != sha256_bytes(stable_json_bytes(files)):
        fail("evaluation evidence model tree hash differs")
    if model is not None and model_value["path"] != str(model):
        fail("evaluation evidence model path differs")
    if model_files is not None and files != model_files:
        fail("evaluation evidence model closure differs")

    holdout_value = value["holdout"]
    if not isinstance(holdout_value, dict):
        fail("evaluation evidence holdout must be an object")
    exact_keys(holdout_value, HOLDOUT_KEYS, "evaluation evidence holdout")
    if not isinstance(holdout_value["path"], str) or not holdout_value["path"]:
        fail("evaluation evidence holdout path is invalid")
    if (
        type(holdout_value["schemaVersion"]) is not int
        or holdout_value["schemaVersion"] != SCHEMA_VERSION
        or not isinstance(holdout_value["corpusHash"], str)
        or not HASH16_PATTERN.fullmatch(holdout_value["corpusHash"])
        or not isinstance(holdout_value["fileSha256"], str)
        or not SHA256_PATTERN.fullmatch(holdout_value["fileSha256"])
        or holdout_value["caseCount"] != HOLDOUT_CASE_COUNT
    ):
        fail("evaluation evidence holdout binding is invalid")
    if holdout_path is not None and holdout_value["path"] != str(holdout_path):
        fail("evaluation evidence holdout path differs")
    if holdout is not None:
        expected_holdout = holdout_evidence(holdout_path, holdout) if holdout_path is not None else None
        if expected_holdout is not None and holdout_value != expected_holdout:
            fail("evaluation evidence holdout closure differs")

    selection_value = value["selection"]
    if not isinstance(selection_value, dict):
        fail("evaluation evidence selection must be an object")
    exact_keys(selection_value, SELECTION_KEYS, "evaluation evidence selection")
    if selection_value["method"] != "canonical-rank-v1":
        fail("evaluation evidence selection method differs")
    requested_count = _safe_integer(
        selection_value["requestedCaseCount"],
        1,
        HOLDOUT_CASE_COUNT,
        "selection.requestedCaseCount",
    )
    if selection_value["selectedCaseCount"] != requested_count:
        fail("evaluation evidence selected case count differs")
    if not isinstance(selection_value["selectedIdsHash"], str) or not HASH16_PATTERN.fullmatch(
        selection_value["selectedIdsHash"]
    ):
        fail("evaluation evidence selected ids hash is invalid")

    rows = value["rows"]
    if not isinstance(rows, list) or len(rows) != requested_count:
        fail("evaluation evidence rows differ from the selection count")
    expected_selected = None
    if holdout is not None:
        expected_selected, expected_selection = select_cases(holdout, requested_count)
        if selection_value != expected_selection:
            fail("evaluation evidence deterministic selection differs")
    ids: list[str] = []
    row_hashes: list[str] = []
    total_elapsed = 0
    for index, row in enumerate(rows):
        label = f"evaluation evidence rows[{index}]"
        if not isinstance(row, dict):
            fail(f"{label} must be an object")
        exact_keys(row, ROW_KEYS, label)
        _safe_integer(row["ordinal"], index, index, f"{label}.ordinal")
        _safe_integer(row["sourceOrdinal"], 0, HOLDOUT_CASE_COUNT - 1, f"{label}.sourceOrdinal")
        if not isinstance(row["id"], str) or not ID_PATTERN.fullmatch(row["id"]):
            fail(f"{label}.id is invalid")
        for field in ("caseHash", "selectionRankHash", "rowHash"):
            if not isinstance(row[field], str) or not HASH16_PATTERN.fullmatch(row[field]):
                fail(f"{label}.{field} is invalid")
        for field in ("promptSha256", "referenceTargetSha256", "outputSha256"):
            if not isinstance(row[field], str) or not SHA256_PATTERN.fullmatch(row[field]):
                fail(f"{label}.{field} is invalid")
        _safe_integer(row["inputTokenCount"], 1, MAX_SOURCE_TOKENS, f"{label}.inputTokenCount")
        _safe_integer(row["generatedTokenCount"], 0, MAX_NEW_TOKENS, f"{label}.generatedTokenCount")
        output = _validate_evidence_output(row["output"], f"{label}.output")
        _safe_integer(
            row["elapsedMicroseconds"],
            0,
            JS_SAFE_INTEGER,
            f"{label}.elapsedMicroseconds",
        )
        if row["outputSha256"] != sha256_text(output):
            fail(f"{label}.outputSha256 differs")
        row_payload = {key: row[key] for key in row if key != "rowHash"}
        if row["rowHash"] != canonical_hash(row_payload):
            fail(f"{label}.rowHash differs")
        if expected_selected is not None:
            source_ordinal, case, rank_hash = expected_selected[index]
            expected = {
                "sourceOrdinal": source_ordinal,
                "id": case["id"],
                "caseHash": case["caseHash"],
                "selectionRankHash": rank_hash,
                "promptSha256": sha256_text(case["prompt"]),
                "referenceTargetSha256": sha256_text(case["target"]),
            }
            if any(row[field] != expected[field] for field in expected):
                fail(f"{label} differs from the sealed deterministic selection")
        ids.append(row["id"])
        row_hashes.append(row["rowHash"])
        total_elapsed += row["elapsedMicroseconds"]
    if len(ids) != len(set(ids)) or len(row_hashes) != len(set(row_hashes)):
        fail("evaluation evidence rows contain duplicates")
    if selection_value["selectedIdsHash"] != canonical_hash(ids):
        fail("evaluation evidence selected ids hash differs")

    summary = value["summary"]
    if not isinstance(summary, dict):
        fail("evaluation evidence summary must be an object")
    exact_keys(summary, SUMMARY_KEYS, "evaluation evidence summary")
    if summary["rowCount"] != len(rows):
        fail("evaluation evidence summary row count differs")
    _safe_integer(
        summary["totalElapsedMicroseconds"],
        0,
        JS_SAFE_INTEGER,
        "summary.totalElapsedMicroseconds",
    )
    if summary["totalElapsedMicroseconds"] != total_elapsed:
        fail("evaluation evidence total timing differs")
    return value


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


def _token_count(encoded: Any, label: str) -> int:
    if not isinstance(encoded, Mapping) or "input_ids" not in encoded:
        fail(f"{label} tokenizer result is invalid")
    input_ids = encoded["input_ids"]
    shape = getattr(input_ids, "shape", None)
    if shape is None or len(shape) != 2 or shape[0] != 1:
        fail(f"{label} tokenizer result must contain exactly one sequence")
    count = int(shape[1])
    if count < 1 or count > MAX_SOURCE_TOKENS:
        fail(f"{label} has {count} input tokens; maximum is {MAX_SOURCE_TOKENS}")
    return count


def _sequence_ids(sequences: Any, label: str) -> list[int]:
    shape = getattr(sequences, "shape", None)
    if shape is None or len(shape) != 2 or shape[0] != 1:
        fail(f"{label} generation must return exactly one sequence")
    sequence = sequences[0]
    if hasattr(sequence, "detach"):
        sequence = sequence.detach()
    if hasattr(sequence, "cpu"):
        sequence = sequence.cpu()
    if hasattr(sequence, "tolist"):
        sequence = sequence.tolist()
    if (
        not isinstance(sequence, list)
        or any(isinstance(token, bool) or not isinstance(token, int) for token in sequence)
    ):
        fail(f"{label} generation returned invalid token ids")
    return sequence


def run_evaluation(
    holdout_path: Path,
    model_path: Path,
    output_path: Path,
    holdout: dict[str, Any],
    model_files: list[dict[str, Any]],
    requested_case_count: int,
) -> dict[str, Any]:
    initial_holdout_sha256 = sha256_file(holdout_path)
    enforce_offline_environment()
    try:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    except ImportError as error:
        fail(f"required offline ML package is unavailable: {error}")

    torch.set_num_threads(CPU_THREADS)
    torch.set_num_interop_threads(CPU_INTEROP_THREADS)
    torch.manual_seed(SEED)
    torch.use_deterministic_algorithms(True)

    tokenizer = AutoTokenizer.from_pretrained(
        str(model_path),
        local_files_only=True,
    )
    model = AutoModelForSeq2SeqLM.from_pretrained(
        str(model_path),
        local_files_only=True,
        use_safetensors=True,
        torch_dtype=torch.float32,
    )
    if not getattr(model.config, "is_encoder_decoder", False):
        fail("model must be an encoder-decoder checkpoint")
    model.to("cpu")
    model.eval()
    for name, tensor in [
        *model.named_parameters(),
        *model.named_buffers(),
    ]:
        if tensor.is_floating_point() and tensor.dtype != torch.float32:
            fail(f"model tensor is not FP32: {name}")

    selected, selection = select_cases(holdout, requested_case_count)
    rows: list[dict[str, Any]] = []
    for ordinal, (source_ordinal, case, rank_hash) in enumerate(selected):
        encoded = tokenizer(
            case["prompt"],
            add_special_tokens=True,
            truncation=False,
            return_tensors="pt",
        )
        input_token_count = _token_count(encoded, case["id"])
        generation_inputs = {"input_ids": encoded["input_ids"].to("cpu")}
        if "attention_mask" in encoded:
            generation_inputs["attention_mask"] = encoded["attention_mask"].to("cpu")
        started = time.perf_counter_ns()
        with torch.inference_mode():
            sequences = model.generate(
                **generation_inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
                num_beams=1,
                num_return_sequences=1,
            )
        elapsed_microseconds = max(0, (time.perf_counter_ns() - started) // 1000)
        ids = _sequence_ids(sequences, case["id"])
        if not ids:
            fail(f"{case['id']} generation returned no decoder-start token")
        generated_token_count = len(ids) - 1
        if generated_token_count > MAX_NEW_TOKENS:
            fail(
                f"{case['id']} generated {generated_token_count} tokens; "
                f"maximum is {MAX_NEW_TOKENS}"
            )
        decoded = tokenizer.batch_decode(
            [ids],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=CLEAN_UP_TOKENIZATION_SPACES,
        )
        if not isinstance(decoded, list) or len(decoded) != 1 or not isinstance(decoded[0], str):
            fail(f"{case['id']} tokenizer must decode exactly one string")
        output = _validate_evidence_output(decoded[0], f"{case['id']} output")
        rows.append(make_result_row(
            ordinal=ordinal,
            source_ordinal=source_ordinal,
            case=case,
            rank_hash=rank_hash,
            input_token_count=input_token_count,
            generated_token_count=generated_token_count,
            output=output,
            elapsed_microseconds=elapsed_microseconds,
        ))
        print(json.dumps({
            "kind": "story-beat-heldout-progress",
            "completed": ordinal + 1,
            "total": len(selected),
            "caseId": case["id"],
            "elapsedMicroseconds": elapsed_microseconds,
        }, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True), flush=True)

    if regular_file_manifest(model_path) != model_files:
        fail("model closure changed during evaluation")
    if sha256_file(holdout_path) != initial_holdout_sha256:
        fail("holdout changed during evaluation")
    reloaded_holdout = load_holdout(holdout_path)
    if reloaded_holdout != holdout:
        fail("holdout content changed during evaluation")
    validate_fresh_output(output_path)
    evidence = build_evidence(
        model=model_path,
        model_files=model_files,
        holdout_path=holdout_path,
        holdout=holdout,
        selection=selection,
        rows=rows,
    )
    validate_evidence(
        evidence,
        model=model_path,
        model_files=model_files,
        holdout_path=holdout_path,
        holdout=holdout,
    )
    serialized = json.dumps(
        evidence,
        ensure_ascii=False,
        allow_nan=False,
        indent=2,
        sort_keys=True,
    ).encode("utf-8") + b"\n"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(output_path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(serialized)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        raise
    loaded = load_json(output_path, "evaluation output")
    validate_evidence(
        loaded,
        model=model_path,
        model_files=model_files,
        holdout_path=holdout_path,
        holdout=holdout,
    )
    return loaded


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--holdout", required=True, help="separately sealed 200-row holdout JSON")
    parser.add_argument("--model", required=True, help="local trained safetensors checkpoint")
    parser.add_argument("--output", required=True, help="fresh JSON evidence file")
    parser.add_argument(
        "--case-count",
        type=int,
        default=HOLDOUT_CASE_COUNT,
        help=f"deterministic smoke subset size; default/full is {HOLDOUT_CASE_COUNT}",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="validate input/model closures and selection without importing ML packages",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    holdout_path = checked_path(args.holdout, "holdout")
    model_path = checked_path(args.model, "model")
    output_path = checked_path(args.output, "output")
    validate_paths(holdout_path, model_path, output_path)
    holdout = load_holdout(holdout_path)
    model_files = validate_model(model_path)
    selected, selection = select_cases(holdout, args.case_count)
    if args.validate_only:
        print(json.dumps({
            "schemaVersion": SCHEMA_VERSION,
            "corpusHash": holdout["corpusHash"],
            "holdoutRows": len(holdout["cases"]),
            "selectedRows": len(selected),
            "selectedIdsHash": selection["selectedIdsHash"],
            "modelFiles": len(model_files),
            "modelTreeSha256": model_evidence(model_path, model_files)["treeSha256"],
            "outputFresh": True,
            "mlPackagesImported": False,
        }, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True))
        return 0
    evidence = run_evaluation(
        holdout_path,
        model_path,
        output_path,
        holdout,
        model_files,
        args.case_count,
    )
    print(json.dumps({
        "kind": evidence["kind"],
        "contentHash": evidence["contentHash"],
        "rows": evidence["summary"]["rowCount"],
        "outputPath": str(output_path),
        "outputFileSha256": sha256_file(output_path),
        "modelAdmitted": False,
        "displayAuthorized": False,
    }, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"story-beat heldout evaluation refused: {error}", file=sys.stderr)
        raise SystemExit(2)
