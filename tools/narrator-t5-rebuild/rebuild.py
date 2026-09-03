#!/usr/bin/env python3
"""Developer-only, offline FLAN-T5 rebuild and two-run receipt harness."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.metadata
import json
import os
import platform
import shutil
import sys
from pathlib import Path, PurePosixPath
from typing import Any

MAX_RUNTIME_BYTES = 100 * 1024 * 1024
SHA256_LENGTH = 64
PROCESS_EVIDENCE_FILE = "build-process.json"


def fail(message: str) -> None:
    raise ValueError(message)


def exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        fail(f"{label} keys differ: {sorted(set(value) ^ expected)}")


def safe_relative_path(value: str) -> bool:
    path = PurePosixPath(value)
    return bool(value) and not path.is_absolute() and "\\" not in value and all(part not in {"", ".", ".."} for part in path.parts)


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def file_evidence(root: Path, relative: str) -> dict[str, Any]:
    if not safe_relative_path(relative):
        fail(f"unsafe manifest path: {relative}")
    path = root / relative
    if path.is_symlink() or not path.is_file():
        fail(f"missing regular file: {relative}")
    return {"path": relative, "byteLength": path.stat().st_size, "sha256": hash_file(path)}


def regular_files(root: Path) -> list[str]:
    if root.is_symlink() or not root.is_dir():
        fail(f"not a regular directory: {root}")
    result: list[str] = []
    for path in root.rglob("*"):
        if path.is_symlink():
            fail(f"symlink is forbidden: {path}")
        if path.is_file():
            result.append(path.relative_to(root).as_posix())
    return sorted(result)


def verify_directory(root: Path, manifest: list[dict[str, Any]], label: str) -> list[dict[str, Any]]:
    declared = sorted(item["path"] for item in manifest)
    if len(declared) != len(set(declared)):
        fail(f"{label} contains duplicate paths")
    actual = regular_files(root)
    if actual != declared:
        fail(f"{label} closure differs: declared={declared}, actual={actual}")
    observed = [file_evidence(root, path) for path in declared]
    if observed != sorted(manifest, key=lambda item: item["path"]):
        fail(f"{label} byte or hash mismatch")
    return observed


def canonical(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > 9007199254740991:
            fail("canonical number is outside JavaScript safe-integer range")
        return str(value)
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            f"{json.dumps(key, ensure_ascii=False)}:{canonical(value[key])}" for key in sorted(value)
        ) + "}"
    fail(f"unsupported canonical value: {type(value).__name__}")


def canonical_hash(value: Any) -> str:
    left = 0x811C9DC5
    right = 0x9E3779B9
    source = canonical(value).encode("utf-16-le", "surrogatepass")
    for index in range(0, len(source), 2):
        code = source[index] | (source[index + 1] << 8)
        left = ((left ^ code) * 0x01000193) & 0xFFFFFFFF
        right ^= (code + 0x9E3779B9 + ((right << 6) & 0xFFFFFFFF) + (right >> 2)) & 0xFFFFFFFF
        right &= 0xFFFFFFFF
    return f"{left:08x}{right:08x}"


def load_lock(path: Path) -> tuple[dict[str, Any], str]:
    if path.is_symlink() or not path.is_file():
        fail("toolchain lock must be a regular file")
    lock = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(lock, dict):
        fail("toolchain lock must be an object")
    exact_keys(lock, {
        "schemaVersion", "source", "platform", "harness", "toolchainRepositories", "distributions",
        "wheelhouse", "recipe", "sessions", "runtimeFiles",
    }, "lock")
    if lock["schemaVersion"] != 2:
        fail("unsupported toolchain lock version")
    harness = lock["harness"]
    exact_keys(harness, {"harnessPath", "harnessSha256"}, "harness")
    if harness["harnessPath"] != "tools/narrator-t5-rebuild/rebuild.py":
        fail("harness path differs from the supported entry point")
    script_path = Path(__file__)
    if script_path.is_symlink() or not script_path.is_file():
        fail("executed rebuild harness must be a regular file")
    if hash_file(script_path) != harness["harnessSha256"]:
        fail("executed rebuild harness hash differs from lock")
    return lock, hash_file(path)


def verify_wheelhouse(root: Path, lock: dict[str, Any]) -> None:
    wheelhouse = lock["wheelhouse"]
    exact_keys(wheelhouse, {"indexes", "files", "totalBytes"}, "wheelhouse")
    observed = verify_directory(root, wheelhouse["files"], "wheelhouse")
    if len(observed) != len(wheelhouse["files"]) or sum(item["byteLength"] for item in observed) != wheelhouse["totalBytes"]:
        fail("wheelhouse count or byte census mismatch")


def verify_source(root: Path, lock: dict[str, Any]) -> None:
    source = lock["source"]
    exact_keys(source, {"repository", "revision", "spdxLicense", "licenseEvidencePath", "files"}, "source")
    verify_directory(root, source["files"], "source")
    if source["licenseEvidencePath"] not in {item["path"] for item in source["files"]}:
        fail("license evidence is not in the source manifest")


def verify_environment(lock: dict[str, Any]) -> None:
    expected = lock["platform"]
    exact_keys(
        expected,
        {"containerImage", "containerDigest", "architecture", "pythonVersion", "pythonHashSeed"},
        "platform",
    )
    if platform.python_version() != expected["pythonVersion"]:
        fail("Python version differs from lock")
    if os.environ.get("GRIND2_CONTAINER_DIGEST") != expected["containerDigest"]:
        fail("GRIND2_CONTAINER_DIGEST does not match the lock")
    if os.environ.get("PYTHONHASHSEED") != expected["pythonHashSeed"]:
        fail("PYTHONHASHSEED does not match the lock")
    for package, version in lock["distributions"].items():
        if importlib.metadata.version(package) != version:
            fail(f"installed distribution differs: {package}")


def validate_onnx(path: Path) -> None:
    import onnx
    import onnxruntime

    model = onnx.load(str(path), load_external_data=False)
    for initializer in model.graph.initializer:
        if initializer.data_location == onnx.TensorProto.EXTERNAL or initializer.external_data:
            fail(f"external-data initializer is forbidden: {path.name}")
    onnx.checker.check_model(model, full_check=True)
    onnxruntime.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def build_once(lock: dict[str, Any], source: Path, destination: Path, ordinal: int, run_id: str) -> None:
    if destination.exists():
        fail(f"fresh build destination already exists: {destination}")
    if not run_id or len(run_id) > 200:
        fail("build run id is invalid")
    destination.mkdir(parents=True)
    process_evidence = {
        "schemaVersion": 1,
        "runId": run_id,
        "ordinal": ordinal,
        "pythonProcessId": os.getpid(),
        "pythonHashSeed": os.environ.get("PYTHONHASHSEED"),
    }
    (destination / PROCESS_EVIDENCE_FILE).write_text(
        json.dumps(process_evidence, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    raw = destination / "raw"
    staged = destination / "staged"
    logs = destination / "logs"
    raw.mkdir()
    (staged / "onnx").mkdir(parents=True)
    logs.mkdir()
    stdout_path = logs / f"build-{ordinal}.stdout.log"
    stderr_path = logs / f"build-{ordinal}.stderr.log"
    os.environ.update({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "HF_DATASETS_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
    })
    try:
        with stdout_path.open("w", encoding="utf-8") as stdout, stderr_path.open("w", encoding="utf-8") as stderr:
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                from optimum.exporters.onnx import main_export
                import onnx
                from onnxruntime.quantization import QuantType, QuantizationMode
                from onnxruntime.quantization.onnx_quantizer import ONNXQuantizer
                from onnxruntime.quantization.registry import IntegerOpsRegistry

                main_export(
                    model_name_or_path=str(source),
                    output=raw,
                    task="text2text-generation-with-past",
                    opset=18,
                    device="cpu",
                    dtype="fp32",
                    optimize=None,
                    monolith=False,
                    no_post_process=False,
                    framework="pt",
                    atol=1e-4,
                    local_files_only=True,
                    trust_remote_code=False,
                    do_validation=True,
                    no_dynamic_axes=False,
                    do_constant_folding=True,
                    slim=False,
                )
                for stem in ("encoder_model", "decoder_model_merged"):
                    source_graph = raw / f"{stem}.onnx"
                    target_graph = staged / "onnx" / f"{stem}_quantized.onnx"
                    model = onnx.load_model(str(source_graph))
                    quantizer = ONNXQuantizer(
                        model,
                        False,
                        False,
                        mode=QuantizationMode.IntegerOps,
                        static=False,
                        weight_qType=QuantType.QInt8,
                        activation_qType=QuantType.QUInt8,
                        tensors_range=None,
                        nodes_to_quantize=[],
                        nodes_to_exclude=[],
                        op_types_to_quantize=set(IntegerOpsRegistry.keys()),
                        extra_options={"EnableSubgraph": True, "MatMulConstBOnly": True},
                    )
                    quantizer.quantize_model()
                    onnx.checker.check_model(quantizer.model.model, full_check=True)
                    onnx.save_model(quantizer.model.model, str(target_graph), save_as_external_data=False)
                    validate_onnx(target_graph)
                for name in ("config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json"):
                    shutil.copyfile(source / name, staged / name)
    except Exception:
        if not stdout_path.exists():
            stdout_path.write_text("build failed before stdout opened\n", encoding="utf-8")
        if not stderr_path.exists() or stderr_path.stat().st_size == 0:
            stderr_path.write_text("build failed; see raised exception\n", encoding="utf-8")
        raise
    stderr_text = stderr_path.read_text(encoding="utf-8")
    if "not within the set tolerance" in stderr_text or "values not close enough" in stderr_text:
        fail("export validation exceeded the locked absolute tolerance")
    staged_total = sum(path.stat().st_size for path in staged.rglob("*") if path.is_file())
    if staged_total > MAX_RUNTIME_BYTES:
        fail(f"runtime artifact budget exceeds 100 MiB after build {ordinal}: {staged_total}")
    if stdout_path.stat().st_size == 0:
        stdout_path.write_text("rebuild completed\n", encoding="utf-8")
    if stderr_path.stat().st_size == 0:
        stderr_path.write_text("no stderr\n", encoding="utf-8")


def observed_run(build: Path, ordinal: int, run_id: str, lock: dict[str, Any], fixture: bool) -> dict[str, Any]:
    process_path = build / PROCESS_EVIDENCE_FILE
    if process_path.is_symlink() or not process_path.is_file():
        fail(f"build {ordinal} process evidence is missing")
    process_evidence = json.loads(process_path.read_text(encoding="utf-8"))
    if not isinstance(process_evidence, dict):
        fail(f"build {ordinal} process evidence is invalid")
    exact_keys(
        process_evidence,
        {"schemaVersion", "runId", "ordinal", "pythonProcessId", "pythonHashSeed"},
        f"build {ordinal} process evidence",
    )
    if (
        process_evidence["schemaVersion"] != 1
        or process_evidence["runId"] != run_id
        or process_evidence["ordinal"] != ordinal
        or not isinstance(process_evidence["pythonProcessId"], int)
        or isinstance(process_evidence["pythonProcessId"], bool)
        or process_evidence["pythonProcessId"] < 1
        or process_evidence["pythonHashSeed"] != lock["platform"]["pythonHashSeed"]
    ):
        fail(f"build {ordinal} process evidence differs")
    runtime_manifest = lock["runtimeFiles"]
    runtime_paths = sorted(item["path"] for item in runtime_manifest)
    if len(runtime_paths) != len(set(runtime_paths)):
        fail("runtime closure contains duplicate paths")
    if regular_files(build / "staged") != runtime_paths:
        fail(f"build {ordinal} runtime closure differs")
    staged_evidence = [file_evidence(build / "staged", path) for path in runtime_paths]
    runtime_artifacts = [
        {**item, "role": next(entry["role"] for entry in runtime_manifest if entry["path"] == item["path"])}
        for item in staged_evidence
    ]
    runtime_artifacts = [
        {"path": item["path"], "role": item["role"], "byteLength": item["byteLength"], "sha256": item["sha256"]}
        for item in runtime_artifacts
    ]
    raw_paths = [
        "config.json", "decoder_model.onnx", "decoder_model_merged.onnx", "decoder_with_past_model.onnx",
        "encoder_model.onnx", "generation_config.json", "special_tokens_map.json", "spiece.model",
        "tokenizer.json", "tokenizer_config.json",
    ]
    raw_actual = regular_files(build / "raw")
    if fixture:
        if raw_actual != raw_paths:
            fail("fixture intermediate closure differs")
    elif raw_actual != raw_paths or any(path.endswith(".onnx_data") for path in raw_actual):
        fail("real build intermediate closure differs or uses external data")
    intermediates = []
    for path in raw_paths:
        if not fixture and path.endswith(".onnx"):
            validate_onnx(build / "raw" / path)
        evidence = file_evidence(build / "raw", path)
        intermediates.append({**evidence, "path": f"raw/{path}"})
    stdout = file_evidence(build, f"logs/build-{ordinal}.stdout.log")
    stderr = file_evidence(build, f"logs/build-{ordinal}.stderr.log")
    return {
        "runId": run_id,
        "ordinal": ordinal,
        "processEvidence": process_evidence,
        "intermediateArtifacts": intermediates,
        "runtimeArtifacts": runtime_artifacts,
        "stdoutLog": stdout,
        "stderrLog": stderr,
    }


def observe_pair(lock_path: Path, source: Path, build_a: Path, build_b: Path, receipt_path: Path,
                 run_a: str, run_b: str, fixture: bool) -> dict[str, Any]:
    lock, lock_sha256 = load_lock(lock_path)
    verify_source(source, lock)
    first = observed_run(build_a, 1, run_a, lock, fixture)
    second = observed_run(build_b, 2, run_b, lock, fixture)
    if first["intermediateArtifacts"] != second["intermediateArtifacts"]:
        fail("two fresh builds have non-identical intermediate artifacts")
    if first["runtimeArtifacts"] != second["runtimeArtifacts"]:
        fail("two fresh builds have non-identical runtime artifacts")
    if first["processEvidence"]["runId"] == second["processEvidence"]["runId"]:
        fail("two fresh builds must have distinct process invocation ids")
    total = sum(item["byteLength"] for item in first["runtimeArtifacts"])
    if total > MAX_RUNTIME_BYTES:
        fail("runtime artifact budget exceeds 100 MiB")
    content = {
        "schemaVersion": 2,
        "source": lock["source"],
        "toolchain": {"lockSha256": lock_sha256, **lock["platform"], **lock["harness"], **lock["toolchainRepositories"],
                      "wheelCount": len(lock["wheelhouse"]["files"]), "wheelBytes": lock["wheelhouse"]["totalBytes"]},
        "recipe": lock["recipe"],
        "sessions": lock["sessions"],
        "runs": [first, second],
        "totalRuntimeBytes": total,
        "processIsolation": "fresh-python-process-per-build",
        "reproducibility": "byte-identical-isolated-processes",
        "disposition": "immutable-rebuild-observed" if not fixture else "deterministic-test-fixture",
        "measuredIncrementalMemoryBytes": None,
        "modelAdmitted": False,
        "displayAuthorized": False,
    }
    receipt = {**content, "contentHash": canonical_hash(content)}
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    verify = subparsers.add_parser("verify-inputs")
    verify.add_argument("--lock", type=Path, required=True)
    verify.add_argument("--source", type=Path, required=True)
    verify.add_argument("--wheelhouse", type=Path, required=True)
    build = subparsers.add_parser("build-one")
    build.add_argument("--lock", type=Path, required=True)
    build.add_argument("--source", type=Path, required=True)
    build.add_argument("--wheelhouse", type=Path, required=True)
    build.add_argument("--workspace", type=Path, required=True)
    build.add_argument("--ordinal", type=int, choices=(1, 2), required=True)
    build.add_argument("--run-id", required=True)
    observe = subparsers.add_parser("observe-pair")
    observe.add_argument("--lock", type=Path, required=True)
    observe.add_argument("--source", type=Path, required=True)
    observe.add_argument("--build-a", type=Path, required=True)
    observe.add_argument("--build-b", type=Path, required=True)
    observe.add_argument("--receipt", type=Path, required=True)
    observe.add_argument("--run-a", required=True)
    observe.add_argument("--run-b", required=True)
    observe.add_argument("--fixture", action="store_true")
    args = parser.parse_args()
    lock, _ = load_lock(args.lock)
    if args.command == "verify-inputs":
        verify_source(args.source, lock)
        verify_wheelhouse(args.wheelhouse, lock)
        print("source and wheelhouse match the immutable lock")
        return
    if args.command == "build-one":
        verify_source(args.source, lock)
        verify_wheelhouse(args.wheelhouse, lock)
        verify_environment(lock)
        build_once(lock, args.source, args.workspace, args.ordinal, args.run_id)
        print(args.workspace)
        return
    if not args.fixture:
        verify_environment(lock)
    observe_pair(args.lock, args.source, args.build_a, args.build_b, args.receipt,
                 args.run_a, args.run_b, args.fixture)
    print(args.receipt)


if __name__ == "__main__":
    main()
