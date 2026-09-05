#!/usr/bin/env python3
"""Offline, developer-only q8 rebuild wrapper for a trained story-beat checkpoint."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any


SCHEMA_VERSION = 1
LOCK_KIND = "story-beat-derived-q8-rebuild-lock"
RECEIPT_KIND = "story-beat-derived-q8-rebuild-receipt"
TRAINING_RECEIPT = "training-receipt.json"
BASE_LOCK_RELATIVE = "tools/narrator-t5-rebuild/toolchain.lock.json"
BASE_HARNESS_RELATIVE = "tools/narrator-t5-rebuild/rebuild.py"
TRAINING_HARNESS_RELATIVE = "tools/narrator-story-beat-training/train.py"
DERIVED_HARNESS_RELATIVE = "tools/narrator-story-beat-rebuild/rebuild.py"
TRUSTED_BASE_LOCK_SHA256 = "f66c37332647f9ca940ee5295e8d2ecff7d1247b32bed16e2a45b362d0df78f2"
TRUSTED_BASE_HARNESS_SHA256 = "f3415303be353746b0f67ca5ea6263a55491fd0cd6cf50d4344851b9f9d5dd71"
VALIDATOR_TRUST_BOUNDARY = "executed-local-code-observed-at-derivation-not-training-launch-evidence"
SHA256_LENGTH = 64
FILE_KEYS = frozenset({"path", "byteLength", "sha256"})
REQUIRED_CHECKPOINT_FILES = frozenset({
    "config.json",
    "generation_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    TRAINING_RECEIPT,
})
PICKLE_SUFFIXES = (".bin", ".pt", ".pth", ".pkl", ".pickle")
EXTERNAL_DATA_SUFFIXES = (".onnx", ".onnx_data", ".external_data", ".data", ".pb")


SCRIPT_PATH = Path(__file__).absolute()
REPOSITORY_ROOT = SCRIPT_PATH.parents[2]


def fail(message: str) -> None:
    raise ValueError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load_module(relative: str, name: str, trusted_sha256: str | None = None) -> Any:
    path = REPOSITORY_ROOT / relative
    if path.is_symlink() or not path.is_file():
        fail(f"required harness is not a regular file: {relative}")
    if trusted_sha256 is not None and sha256_file(path) != trusted_sha256:
        fail(f"required harness differs from pinned committed evidence: {relative}")
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        fail(f"could not import required harness: {relative}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# This historical executable is checked before import against the digest recorded
# in docs/narrator/t5-rebuild-receipt-v2.json.
HISTORICAL = _load_module(
    BASE_HARNESS_RELATIVE,
    "grind2_historical_narrator_rebuild",
    TRUSTED_BASE_HARNESS_SHA256,
)
# The training receipt does not bind launch-time harness bytes. Importing this
# validator is therefore an explicit trusted-local-code boundary, not evidence
# that these bytes produced the checkpoint.
TRAINER = _load_module(TRAINING_HARNESS_RELATIVE, "grind2_story_beat_trainer")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            fail(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json_bytes(value: bytes, label: str) -> Any:
    try:
        return json.loads(
            value.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=lambda value: fail(f"non-finite JSON value: {value}"),
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"{label} is not strict UTF-8 JSON: {error}")


def load_json(path: Path, label: str) -> Any:
    require_regular_file(path, label)
    return load_json_bytes(path.read_bytes(), label)


def safe_relative_path(value: str) -> bool:
    path = PurePosixPath(value)
    return (
        bool(value)
        and not path.is_absolute()
        and "\\" not in value
        and all(part not in {"", ".", "..", "~"} for part in path.parts)
    )


def checked_path(raw: str, label: str) -> Path:
    if not raw or "\x00" in raw or "\\" in raw:
        fail(f"{label} path is unsafe")
    candidate = Path(raw)
    if any(part in {"..", "~"} for part in candidate.parts):
        fail(f"{label} path traversal is forbidden")
    absolute = candidate if candidate.is_absolute() else Path.cwd() / candidate
    absolute = Path(os.path.abspath(absolute))
    for part in [absolute, *absolute.parents]:
        if part.exists() and part.is_symlink():
            fail(f"{label} path contains a symlink: {part}")
    return absolute


def require_regular_file(path: Path, label: str) -> None:
    if path.is_symlink() or not path.is_file():
        fail(f"{label} must be a regular file")


def require_regular_directory(path: Path, label: str) -> None:
    if path.is_symlink() or not path.is_dir():
        fail(f"{label} must be a regular directory")


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def require_disjoint(paths: list[tuple[str, Path]]) -> None:
    for index, (left_label, left) in enumerate(paths):
        for right_label, right in paths[index + 1:]:
            if left == right or _is_within(left, right) or _is_within(right, left):
                fail(f"{left_label} overlaps {right_label}")


def validate_fresh_file(path: Path, label: str) -> None:
    if path.exists() or path.is_symlink():
        fail(f"{label} must be fresh")
    require_regular_directory(path.parent, f"{label} parent")


def validate_fresh_directory(path: Path, label: str) -> None:
    if path.exists() or path.is_symlink():
        fail(f"{label} must be fresh")
    if path == Path(path.anchor):
        fail(f"{label} cannot be a filesystem root")
    require_regular_directory(path.parent, f"{label} parent")


def file_evidence(root: Path, relative: str) -> dict[str, Any]:
    if not safe_relative_path(relative):
        fail(f"unsafe manifest path: {relative}")
    path = root / relative
    require_regular_file(path, relative)
    return {
        "path": relative,
        "byteLength": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def regular_file_manifest(root: Path) -> list[dict[str, Any]]:
    require_regular_directory(root, "manifest root")
    paths: list[str] = []
    for path in root.rglob("*"):
        if path.is_symlink():
            fail(f"symlink is forbidden: {path}")
        if path.is_file():
            paths.append(path.relative_to(root).as_posix())
    return [file_evidence(root, path) for path in sorted(paths)]


def manifest_sha256(manifest: list[dict[str, Any]]) -> str:
    return sha256_bytes(stable_json_bytes(manifest))


def _validate_manifest(manifest: Any, label: str) -> list[dict[str, Any]]:
    if not isinstance(manifest, list) or not manifest:
        fail(f"{label} must be a non-empty array")
    paths: list[str] = []
    for item in manifest:
        if not isinstance(item, dict) or set(item) != FILE_KEYS:
            fail(f"{label} entry keys differ")
        path = item["path"]
        if not isinstance(path, str) or not safe_relative_path(path):
            fail(f"{label} contains an unsafe path")
        if isinstance(item["byteLength"], bool) or not isinstance(item["byteLength"], int) or item["byteLength"] < 0:
            fail(f"{label} contains an invalid byte length")
        digest = item["sha256"]
        if not isinstance(digest, str) or len(digest) != SHA256_LENGTH or any(c not in "0123456789abcdef" for c in digest):
            fail(f"{label} contains an invalid SHA-256")
        paths.append(path)
    if paths != sorted(paths) or len(paths) != len(set(paths)):
        fail(f"{label} paths must be unique and sorted")
    return manifest


def _checkpoint_closure(checkpoint: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    manifest = regular_file_manifest(checkpoint)
    paths = [item["path"] for item in manifest]
    lowered = [path.lower() for path in paths]
    receipt_paths = [
        path for path in paths
        if "receipt" in PurePosixPath(path).name.lower()
    ]
    if receipt_paths != [TRAINING_RECEIPT]:
        fail("checkpoint must contain exactly one root training-receipt.json")
    if not REQUIRED_CHECKPOINT_FILES.issubset(paths):
        fail("checkpoint is missing files required by the historical q8 build")
    if not any(path.endswith(".safetensors") for path in lowered):
        fail("checkpoint is missing safetensors weights")
    if any(path.endswith(PICKLE_SUFFIXES) for path in lowered):
        fail("pickle checkpoint files are forbidden")
    if any(path.endswith(EXTERNAL_DATA_SUFFIXES) or ".onnx_data/" in path for path in lowered):
        fail("external-data checkpoint files are forbidden")
    receipt_path = checkpoint / TRAINING_RECEIPT
    receipt = TRAINER.load_json(receipt_path, "training receipt")
    TRAINER.validate_receipt(checkpoint, receipt)
    return manifest, receipt


def locked_package_version(base_lock: dict[str, Any], package: str) -> str:
    declared = base_lock["distributions"].get(package)
    if isinstance(declared, str) and declared:
        return declared
    normalized = package.replace("_", "-").lower() + "-"
    matches: list[str] = []
    for item in base_lock["wheelhouse"]["files"]:
        filename = PurePosixPath(item["path"]).name
        comparable = filename.replace("_", "-").lower()
        if comparable.startswith(normalized) and comparable.endswith(".whl"):
            matches.append(filename[len(normalized):].split("-", 1)[0])
    if len(matches) != 1 or not matches[0]:
        fail(f"locked wheel version is ambiguous or missing: {package}")
    return matches[0]


def _verify_training_lineage(receipt: dict[str, Any], base_lock: dict[str, Any]) -> None:
    if receipt["source"]["files"] != base_lock["source"]["files"]:
        fail("training receipt source closure differs from the immutable base source")
    expected_tree = sha256_bytes(stable_json_bytes(base_lock["source"]["files"]))
    if receipt["source"]["treeSha256"] != expected_tree:
        fail("training receipt source tree hash differs from the immutable base source")
    expected_packages = {
        "python": base_lock["platform"]["pythonVersion"],
        "torch": locked_package_version(base_lock, "torch"),
        "transformers": locked_package_version(base_lock, "transformers"),
        "tokenizers": locked_package_version(base_lock, "tokenizers"),
        "safetensors": locked_package_version(base_lock, "safetensors"),
    }
    if receipt["packages"] != expected_packages:
        fail("training receipt package versions differ from the locked rebuild toolchain")


def verify_locked_environment(base_lock: dict[str, Any]) -> None:
    HISTORICAL.verify_environment(base_lock)
    for package in ("tokenizers", "safetensors"):
        expected = locked_package_version(base_lock, package)
        try:
            observed = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            fail(f"installed distribution is missing: {package}")
        if observed != expected:
            fail(f"installed distribution differs from locked wheel: {package}")


def _load_base(base_lock_path: Path, allow_fixture: bool) -> tuple[dict[str, Any], str]:
    base_lock, base_lock_sha256 = HISTORICAL.load_lock(base_lock_path)
    if not allow_fixture and base_lock_sha256 != TRUSTED_BASE_LOCK_SHA256:
        fail("base lock differs from the immutable digest in committed rebuild evidence")
    return base_lock, base_lock_sha256


def _base_evidence(base_lock: dict[str, Any], base_lock_path: Path, base_lock_sha256: str) -> dict[str, Any]:
    source = base_lock["source"]
    wheelhouse = base_lock["wheelhouse"]
    return {
        "lock": {
            "path": BASE_LOCK_RELATIVE,
            "byteLength": base_lock_path.stat().st_size,
            "sha256": base_lock_sha256,
        },
        "harness": base_lock["harness"],
        "source": {
            "repository": source["repository"],
            "revision": source["revision"],
            "spdxLicense": source["spdxLicense"],
            "licenseEvidencePath": source["licenseEvidencePath"],
            "fileCount": len(source["files"]),
            "manifestSha256": manifest_sha256(source["files"]),
        },
        "wheelhouse": {
            "fileCount": len(wheelhouse["files"]),
            "totalBytes": wheelhouse["totalBytes"],
            "manifestSha256": manifest_sha256(wheelhouse["files"]),
        },
        "platform": base_lock["platform"],
        "toolchainRepositories": base_lock["toolchainRepositories"],
    }


def _payload(
    base_lock: dict[str, Any],
    base_lock_path: Path,
    base_lock_sha256: str,
    checkpoint: Path,
    checkpoint_manifest: list[dict[str, Any]],
    training_receipt: dict[str, Any],
) -> dict[str, Any]:
    training_receipt_evidence = file_evidence(checkpoint, TRAINING_RECEIPT)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": LOCK_KIND,
        "disposition": "developer-derived-artifact-not-runtime-admitted",
        "base": _base_evidence(base_lock, base_lock_path, base_lock_sha256),
        "training": {
            "receiptValidatorObservedAtDerivation": {
                "path": TRAINING_HARNESS_RELATIVE,
                "sha256": sha256_file(REPOSITORY_ROOT / TRAINING_HARNESS_RELATIVE),
                "trustBoundary": VALIDATOR_TRUST_BOUNDARY,
            },
            "receipt": {
                **training_receipt_evidence,
                "receiptSha256": training_receipt["receiptSha256"],
            },
            "corpus": {
                "schemaVersion": training_receipt["corpus"]["schemaVersion"],
                "corpusHash": training_receipt["corpus"]["corpusHash"],
                "fileSha256": training_receipt["corpus"]["fileSha256"],
            },
            "rows": training_receipt["rows"],
        },
        "checkpoint": {
            "files": checkpoint_manifest,
            "treeSha256": manifest_sha256(checkpoint_manifest),
        },
        "rebuild": {
            "harness": {
                "path": DERIVED_HARNESS_RELATIVE,
                "sha256": sha256_file(SCRIPT_PATH),
            },
            "importedHistoricalFunctions": ["build_once", "observed_run"],
            "recipe": base_lock["recipe"],
            "sessions": base_lock["sessions"],
            "runtimeFiles": base_lock["runtimeFiles"],
        },
        "modelAdmitted": False,
        "displayAuthorized": False,
    }


def seal(payload: dict[str, Any]) -> dict[str, Any]:
    return {**payload, "contentSha256": sha256_bytes(stable_json_bytes(payload))}


def _write_json_exclusive(path: Path, value: Any, label: str) -> None:
    encoded = (
        json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    ).encode("utf-8")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            descriptor = -1
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary_path, path, follow_symlinks=False)
        except FileExistsError:
            fail(f"{label} must be fresh")
        directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
        directory_descriptor = os.open(path.parent, directory_flags)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass


def _validate_base_inputs(base_source: Path, wheelhouse: Path, base_lock: dict[str, Any]) -> None:
    HISTORICAL.verify_source(base_source, base_lock)
    source = base_lock["source"]
    if not isinstance(source.get("spdxLicense"), str) or not source["spdxLicense"]:
        fail("base source SPDX license is missing")
    license_path = base_source / source["licenseEvidencePath"]
    require_regular_file(license_path, "base source license evidence")
    if license_path.stat().st_size == 0:
        fail("base source license evidence is empty")
    HISTORICAL.verify_wheelhouse(wheelhouse, base_lock)


def _input_paths(
    base_lock_path: Path,
    base_source: Path,
    wheelhouse: Path,
    checkpoint: Path,
) -> list[tuple[str, Path]]:
    require_regular_file(base_lock_path, "base lock")
    require_regular_directory(base_source, "base source")
    require_regular_directory(wheelhouse, "wheelhouse")
    require_regular_directory(checkpoint, "checkpoint")
    directories = [("base source", base_source), ("wheelhouse", wheelhouse), ("checkpoint", checkpoint)]
    require_disjoint(directories)
    if any(_is_within(base_lock_path, path) for _, path in directories):
        fail("base lock overlaps an immutable directory input")
    return [("base lock", base_lock_path), *directories]


def create_lock(
    base_lock_path: Path,
    base_source: Path,
    wheelhouse: Path,
    checkpoint: Path,
    output: Path,
    *,
    allow_fixture: bool = False,
) -> dict[str, Any]:
    inputs = _input_paths(base_lock_path, base_source, wheelhouse, checkpoint)
    validate_fresh_file(output, "derived lock")
    if any(output == path or _is_within(output, path) for _, path in inputs):
        fail("derived lock overlaps an immutable input")
    base_lock, base_lock_sha256 = _load_base(base_lock_path, allow_fixture)
    _validate_base_inputs(base_source, wheelhouse, base_lock)
    checkpoint_manifest, training_receipt = _checkpoint_closure(checkpoint)
    _verify_training_lineage(training_receipt, base_lock)
    derived = seal(_payload(
        base_lock,
        base_lock_path,
        base_lock_sha256,
        checkpoint,
        checkpoint_manifest,
        training_receipt,
    ))
    _write_json_exclusive(output, derived, "derived lock")
    return derived


def verify_bundle(
    derived_lock_path: Path,
    base_lock_path: Path,
    base_source: Path,
    wheelhouse: Path,
    checkpoint: Path,
    *,
    allow_fixture: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    inputs = _input_paths(base_lock_path, base_source, wheelhouse, checkpoint)
    require_regular_file(derived_lock_path, "derived lock")
    if any(derived_lock_path == path or _is_within(derived_lock_path, path) for _, path in inputs):
        fail("derived lock overlaps an immutable input")
    value = load_json(derived_lock_path, "derived lock")
    if not isinstance(value, dict) or "contentSha256" not in value:
        fail("derived lock must be a sealed object")
    payload = {key: value[key] for key in value if key != "contentSha256"}
    if value.get("contentSha256") != sha256_bytes(stable_json_bytes(payload)):
        fail("derived lock content hash differs")
    if value.get("modelAdmitted") is not False or value.get("displayAuthorized") is not False:
        fail("derived lock cannot admit a model or authorize display")
    base_lock, base_lock_sha256 = _load_base(base_lock_path, allow_fixture)
    _validate_base_inputs(base_source, wheelhouse, base_lock)
    checkpoint_manifest, training_receipt = _checkpoint_closure(checkpoint)
    _verify_training_lineage(training_receipt, base_lock)
    expected = seal(_payload(
        base_lock,
        base_lock_path,
        base_lock_sha256,
        checkpoint,
        checkpoint_manifest,
        training_receipt,
    ))
    if value != expected:
        fail("derived lock provenance differs from the verified inputs or harnesses")
    return value, base_lock


def _verify_after_operation(
    expected: dict[str, Any],
    derived_lock_path: Path,
    base_lock_path: Path,
    base_source: Path,
    wheelhouse: Path,
    checkpoint: Path,
    *,
    allow_fixture: bool = False,
) -> None:
    observed, _ = verify_bundle(
        derived_lock_path,
        base_lock_path,
        base_source,
        wheelhouse,
        checkpoint,
        allow_fixture=allow_fixture,
    )
    if observed != expected:
        fail("verified input bundle changed during the operation")


def build_one(
    derived_lock_path: Path,
    base_lock_path: Path,
    base_source: Path,
    wheelhouse: Path,
    checkpoint: Path,
    workspace: Path,
    ordinal: int,
    run_id: str,
) -> None:
    derived, base_lock = verify_bundle(
        derived_lock_path, base_lock_path, base_source, wheelhouse, checkpoint
    )
    validate_fresh_directory(workspace, "build workspace")
    require_disjoint([
        ("base source", base_source),
        ("wheelhouse", wheelhouse),
        ("checkpoint", checkpoint),
        ("build workspace", workspace),
    ])
    verify_locked_environment(base_lock)
    HISTORICAL.build_once(base_lock, checkpoint, workspace, ordinal, run_id)
    _verify_after_operation(
        derived, derived_lock_path, base_lock_path, base_source, wheelhouse, checkpoint
    )


def _expected_pair_receipt(
    derived_lock_path: Path,
    base_lock_path: Path,
    base_source: Path,
    wheelhouse: Path,
    checkpoint: Path,
    build_a: Path,
    build_b: Path,
    run_a: str,
    run_b: str,
    *,
    fixture: bool = False,
    allow_fixture: bool = False,
) -> dict[str, Any]:
    derived, base_lock = verify_bundle(
        derived_lock_path,
        base_lock_path,
        base_source,
        wheelhouse,
        checkpoint,
        allow_fixture=allow_fixture,
    )
    require_regular_directory(build_a, "build A")
    require_regular_directory(build_b, "build B")
    require_disjoint([
        ("base source", base_source),
        ("wheelhouse", wheelhouse),
        ("checkpoint", checkpoint),
        ("build A", build_a),
        ("build B", build_b),
    ])
    build_manifests = (
        regular_file_manifest(build_a),
        regular_file_manifest(build_b),
    )
    if not fixture:
        verify_locked_environment(base_lock)
    first = HISTORICAL.observed_run(build_a, 1, run_a, base_lock, fixture)
    second = HISTORICAL.observed_run(build_b, 2, run_b, base_lock, fixture)
    if first["intermediateArtifacts"] != second["intermediateArtifacts"]:
        fail("two fresh builds have non-identical intermediate artifacts")
    if first["runtimeArtifacts"] != second["runtimeArtifacts"]:
        fail("two fresh builds have non-identical runtime artifacts")
    if first["processEvidence"]["runId"] == second["processEvidence"]["runId"]:
        fail("two fresh builds must have distinct process invocation ids")
    total = sum(item["byteLength"] for item in first["runtimeArtifacts"])
    if total > HISTORICAL.MAX_RUNTIME_BYTES:
        fail("runtime artifact budget exceeds 100 MiB")
    _verify_after_operation(
        derived,
        derived_lock_path,
        base_lock_path,
        base_source,
        wheelhouse,
        checkpoint,
        allow_fixture=allow_fixture,
    )
    if (
        regular_file_manifest(build_a) != build_manifests[0]
        or regular_file_manifest(build_b) != build_manifests[1]
    ):
        fail("build changed during observation")
    content = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": RECEIPT_KIND,
        "derivedLock": {
            "fileSha256": sha256_file(derived_lock_path),
            "contentSha256": derived["contentSha256"],
        },
        "base": derived["base"],
        "training": derived["training"],
        "checkpoint": derived["checkpoint"],
        "rebuild": derived["rebuild"],
        "runs": [first, second],
        "totalRuntimeBytes": total,
        "processIsolation": "fresh-python-process-per-build",
        "reproducibility": "byte-identical-isolated-processes",
        "disposition": (
            "deterministic-derived-test-fixture"
            if fixture
            else "derived-checkpoint-rebuild-observed-not-runtime-admitted"
        ),
        "modelAdmitted": False,
        "displayAuthorized": False,
    }
    return {**content, "receiptSha256": sha256_bytes(stable_json_bytes(content))}


def _validate_receipt_path(
    receipt_path: Path,
    derived_lock_path: Path,
    base_source: Path,
    wheelhouse: Path,
    checkpoint: Path,
    build_a: Path,
    build_b: Path,
) -> None:
    if receipt_path == derived_lock_path or any(
        _is_within(receipt_path, path)
        for path in (base_source, wheelhouse, checkpoint, build_a, build_b)
    ):
        fail("observation receipt overlaps a verified input or build")


def observe_pair(
    derived_lock_path: Path,
    base_lock_path: Path,
    base_source: Path,
    wheelhouse: Path,
    checkpoint: Path,
    build_a: Path,
    build_b: Path,
    receipt_path: Path,
    run_a: str,
    run_b: str,
    *,
    fixture: bool = False,
    allow_fixture: bool = False,
) -> dict[str, Any]:
    validate_fresh_file(receipt_path, "observation receipt")
    _validate_receipt_path(
        receipt_path,
        derived_lock_path,
        base_source,
        wheelhouse,
        checkpoint,
        build_a,
        build_b,
    )
    receipt = _expected_pair_receipt(
        derived_lock_path,
        base_lock_path,
        base_source,
        wheelhouse,
        checkpoint,
        build_a,
        build_b,
        run_a,
        run_b,
        fixture=fixture,
        allow_fixture=allow_fixture,
    )
    _write_json_exclusive(receipt_path, receipt, "observation receipt")
    return receipt


def verify_pair(
    derived_lock_path: Path,
    base_lock_path: Path,
    base_source: Path,
    wheelhouse: Path,
    checkpoint: Path,
    build_a: Path,
    build_b: Path,
    receipt_path: Path,
    run_a: str,
    run_b: str,
    *,
    fixture: bool = False,
    allow_fixture: bool = False,
) -> dict[str, Any]:
    require_regular_file(receipt_path, "observation receipt")
    _validate_receipt_path(
        receipt_path,
        derived_lock_path,
        base_source,
        wheelhouse,
        checkpoint,
        build_a,
        build_b,
    )
    observed_bytes = receipt_path.read_bytes()
    observed = load_json_bytes(observed_bytes, "observation receipt")
    expected = _expected_pair_receipt(
        derived_lock_path,
        base_lock_path,
        base_source,
        wheelhouse,
        checkpoint,
        build_a,
        build_b,
        run_a,
        run_b,
        fixture=fixture,
        allow_fixture=allow_fixture,
    )
    require_regular_file(receipt_path, "observation receipt")
    if receipt_path.read_bytes() != observed_bytes:
        fail("observation receipt changed during verification")
    if stable_json_bytes(observed) != stable_json_bytes(expected):
        fail("observation receipt differs from the verified inputs or builds")
    return expected


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    def common(command: argparse.ArgumentParser, *, include_derived: bool = True) -> None:
        if include_derived:
            command.add_argument("--lock", required=True, help="fresh derived rebuild lock")
        command.add_argument("--base-lock", required=True, help="historical toolchain lock")
        command.add_argument("--base-source", required=True, help="immutable original model source")
        command.add_argument("--wheelhouse", required=True, help="historical locked wheelhouse")
        command.add_argument("--checkpoint", required=True, help="trained checkpoint with its receipt")

    create = commands.add_parser("create-lock")
    common(create, include_derived=False)
    create.add_argument("--output", required=True, help="fresh derived lock path")

    verify = commands.add_parser("verify-inputs")
    common(verify)

    build = commands.add_parser("build-one")
    common(build)
    build.add_argument("--workspace", required=True)
    build.add_argument("--ordinal", type=int, choices=(1, 2), required=True)
    build.add_argument("--run-id", required=True)

    observe = commands.add_parser("observe-pair")
    common(observe)
    observe.add_argument("--build-a", required=True)
    observe.add_argument("--build-b", required=True)
    observe.add_argument("--receipt", required=True)
    observe.add_argument("--run-a", required=True)
    observe.add_argument("--run-b", required=True)

    verify_pair_command = commands.add_parser("verify-pair")
    common(verify_pair_command)
    verify_pair_command.add_argument("--build-a", required=True)
    verify_pair_command.add_argument("--build-b", required=True)
    verify_pair_command.add_argument("--receipt", required=True)
    verify_pair_command.add_argument("--run-a", required=True)
    verify_pair_command.add_argument("--run-b", required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    base_lock_path = checked_path(args.base_lock, "base lock")
    base_source = checked_path(args.base_source, "base source")
    wheelhouse = checked_path(args.wheelhouse, "wheelhouse")
    checkpoint = checked_path(args.checkpoint, "checkpoint")
    if args.command == "create-lock":
        output = checked_path(args.output, "derived lock")
        create_lock(base_lock_path, base_source, wheelhouse, checkpoint, output)
        print(output)
        return 0
    derived_lock_path = checked_path(args.lock, "derived lock")
    if args.command == "verify-inputs":
        verify_bundle(derived_lock_path, base_lock_path, base_source, wheelhouse, checkpoint)
        print("base license/source, wheelhouse, training receipt, and checkpoint match the derived lock")
        return 0
    if args.command == "build-one":
        workspace = checked_path(args.workspace, "build workspace")
        build_one(
            derived_lock_path,
            base_lock_path,
            base_source,
            wheelhouse,
            checkpoint,
            workspace,
            args.ordinal,
            args.run_id,
        )
        print(workspace)
        return 0
    build_a = checked_path(args.build_a, "build A")
    build_b = checked_path(args.build_b, "build B")
    receipt_path = checked_path(args.receipt, "observation receipt")
    if args.command == "observe-pair":
        observe_pair(
            derived_lock_path,
            base_lock_path,
            base_source,
            wheelhouse,
            checkpoint,
            build_a,
            build_b,
            receipt_path,
            args.run_a,
            args.run_b,
        )
        print(receipt_path)
        return 0
    verify_pair(
        derived_lock_path,
        base_lock_path,
        base_source,
        wheelhouse,
        checkpoint,
        build_a,
        build_b,
        receipt_path,
        args.run_a,
        args.run_b,
    )
    print("observation receipt and both builds match the verified input bundle")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"story-beat derived rebuild refused: {error}", file=sys.stderr)
        raise SystemExit(2)
