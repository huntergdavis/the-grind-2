from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest import mock


SCRIPT = Path(__file__).with_name("rebuild.py")
SPEC = importlib.util.spec_from_file_location("story_beat_derived_rebuild", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
HARNESS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HARNESS)


RAW_FILES = (
    "config.json",
    "decoder_model.onnx",
    "decoder_model_merged.onnx",
    "decoder_with_past_model.onnx",
    "encoder_model.onnx",
    "generation_config.json",
    "special_tokens_map.json",
    "spiece.model",
    "tokenizer.json",
    "tokenizer_config.json",
)


class Fixture:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.base_source = root / "base-source"
        self.wheelhouse = root / "wheelhouse"
        self.checkpoint = root / "checkpoint"
        self.base_lock_path = root / "base-lock.json"
        self.derived_lock_path = root / "derived-lock.json"
        self.corpus_path = root / "train-dev.json"
        self.base_source.mkdir()
        self.wheelhouse.mkdir()
        self.checkpoint.mkdir()
        (self.base_source / "README.md").write_text("SPDX-License-Identifier: Apache-2.0\n")
        (self.base_source / "config.json").write_text("{}\n")
        (self.base_source / "model.safetensors").write_bytes(b"base weights\n")
        (self.base_source / "tokenizer.json").write_text("{}\n")
        (self.base_source / "tokenizer_config.json").write_text("{}\n")
        wheel = self.wheelhouse / "fixture.whl"
        wheel.write_bytes(b"wheel\n")

        committed = json.loads(
            (HARNESS.REPOSITORY_ROOT / HARNESS.BASE_LOCK_RELATIVE).read_text(encoding="utf-8")
        )
        source_manifest = HARNESS.regular_file_manifest(self.base_source)
        wheel_manifest = HARNESS.regular_file_manifest(self.wheelhouse)
        self.base_lock = {
            **committed,
            "distributions": {
                **committed["distributions"],
                "tokenizers": "0.22.2",
                "safetensors": "0.8.0",
            },
            "source": {
                "repository": "google/flan-t5-small",
                "revision": "0fc9ddf78a1e988dac52e2dac162b0ede4fd74ab",
                "spdxLicense": "Apache-2.0",
                "licenseEvidencePath": "README.md",
                "files": source_manifest,
            },
            "wheelhouse": {
                "indexes": [],
                "files": wheel_manifest,
                "totalBytes": sum(item["byteLength"] for item in wheel_manifest),
            },
        }
        self.base_lock_path.write_text(json.dumps(self.base_lock) + "\n")
        self.corpus_path.write_text('{"fixture":true}\n')
        for name, contents in {
            "config.json": "{}\n",
            "generation_config.json": "{}\n",
            "tokenizer.json": "{}\n",
            "tokenizer_config.json": "{}\n",
            "training-log.json": "{}\n",
        }.items():
            (self.checkpoint / name).write_text(contents)
        (self.checkpoint / "model.safetensors").write_bytes(b"tuned weights\n")
        packages = {
            "python": self.base_lock["platform"]["pythonVersion"],
            "torch": HARNESS.locked_package_version(self.base_lock, "torch"),
            "transformers": HARNESS.locked_package_version(self.base_lock, "transformers"),
            "tokenizers": HARNESS.locked_package_version(self.base_lock, "tokenizers"),
            "safetensors": HARNESS.locked_package_version(self.base_lock, "safetensors"),
        }
        self.training_receipt = HARNESS.TRAINER.make_receipt(
            source=self.base_source,
            source_files=source_manifest,
            corpus_path=self.corpus_path,
            corpus={
                "schemaVersion": 1,
                "corpusHash": "1" * 16,
                "cases": [
                    {"split": "train"},
                    {"split": "dev"},
                ],
            },
            destination=self.checkpoint,
            train_losses=[1.0, 0.5, 0.25],
            dev_loss=0.2,
            logs=[
                {"epoch": 1, "meanTrainLoss": 1.0, "optimizerSteps": 1},
                {"epoch": 2, "meanTrainLoss": 0.5, "optimizerSteps": 2},
                {"epoch": 3, "meanTrainLoss": 0.25, "optimizerSteps": 3},
            ],
            package_versions=packages,
        )
        (self.checkpoint / HARNESS.TRAINING_RECEIPT).write_text(
            json.dumps(self.training_receipt) + "\n"
        )

    def create_lock(self, output: Path | None = None) -> dict[str, Any]:
        return HARNESS.create_lock(
            self.base_lock_path,
            self.base_source,
            self.wheelhouse,
            self.checkpoint,
            self.derived_lock_path if output is None else output,
            allow_fixture=True,
        )

    def verify(self) -> tuple[dict[str, Any], dict[str, Any]]:
        return HARNESS.verify_bundle(
            self.derived_lock_path,
            self.base_lock_path,
            self.base_source,
            self.wheelhouse,
            self.checkpoint,
            allow_fixture=True,
        )

    def build_fixture(self, ordinal: int) -> Path:
        build = self.root / f"build-{ordinal}"
        (build / "raw").mkdir(parents=True)
        (build / "staged").mkdir()
        (build / "logs").mkdir()
        for name in RAW_FILES:
            path = build / "raw" / name
            path.write_text(f"{name}\n")
        for item in self.base_lock["runtimeFiles"]:
            path = build / "staged" / item["path"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f"{item['path']}\n")
        (build / "logs" / f"build-{ordinal}.stdout.log").write_text("fixture stdout\n")
        (build / "logs" / f"build-{ordinal}.stderr.log").write_text("fixture stderr\n")
        (build / "build-process.json").write_text(json.dumps({
            "schemaVersion": 1,
            "runId": f"fixture:{ordinal}",
            "ordinal": ordinal,
            "pythonProcessId": ordinal,
            "pythonHashSeed": self.base_lock["platform"]["pythonHashSeed"],
        }) + "\n")
        return build


class DerivedCheckpointRebuildTest(unittest.TestCase):
    def test_anchors_official_base_lock_to_committed_evidence_digest(self) -> None:
        official = HARNESS.REPOSITORY_ROOT / HARNESS.BASE_LOCK_RELATIVE
        _, observed = HARNESS._load_base(official, allow_fixture=False)
        self.assertEqual(observed, HARNESS.TRUSTED_BASE_LOCK_SHA256)
        with tempfile.TemporaryDirectory(prefix="grind2-derived-rebuild-") as temporary:
            drifted = Path(temporary) / "drifted-lock.json"
            value = json.loads(official.read_text(encoding="utf-8"))
            value["recipe"]["absoluteTolerance"] = "1e-3"
            drifted.write_text(json.dumps(value) + "\n")
            with self.assertRaisesRegex(ValueError, "immutable digest"):
                HARNESS._load_base(drifted, allow_fixture=False)

    def test_resolves_transitive_versions_from_committed_wheels(self) -> None:
        base_lock = json.loads(
            (HARNESS.REPOSITORY_ROOT / HARNESS.BASE_LOCK_RELATIVE).read_text(encoding="utf-8")
        )
        self.assertEqual(HARNESS.locked_package_version(base_lock, "tokenizers"), "0.22.2")
        self.assertEqual(HARNESS.locked_package_version(base_lock, "safetensors"), "0.8.0")

    def test_creates_deterministic_lock_and_observes_two_fixture_builds(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-derived-rebuild-") as temporary:
            fixture = Fixture(Path(temporary))
            first = fixture.create_lock()
            second_path = fixture.root / "derived-lock-copy.json"
            second = fixture.create_lock(second_path)
            self.assertEqual(first, second)
            self.assertEqual(fixture.derived_lock_path.read_bytes(), second_path.read_bytes())
            verified, _ = fixture.verify()
            self.assertEqual(verified, first)
            self.assertFalse(verified["modelAdmitted"])
            self.assertFalse(verified["displayAuthorized"])
            self.assertEqual(
                verified["rebuild"]["importedHistoricalFunctions"],
                ["build_once", "observed_run"],
            )
            validator = verified["training"]["receiptValidatorObservedAtDerivation"]
            self.assertEqual(validator["trustBoundary"], HARNESS.VALIDATOR_TRUST_BOUNDARY)
            self.assertNotIn("harness", verified["training"])

            build_a = fixture.build_fixture(1)
            build_b = fixture.build_fixture(2)
            receipt_path = fixture.root / "observation.json"
            receipt = HARNESS.observe_pair(
                fixture.derived_lock_path,
                fixture.base_lock_path,
                fixture.base_source,
                fixture.wheelhouse,
                fixture.checkpoint,
                build_a,
                build_b,
                receipt_path,
                "fixture:1",
                "fixture:2",
                fixture=True,
                allow_fixture=True,
            )
            self.assertEqual(receipt["disposition"], "deterministic-derived-test-fixture")
            self.assertEqual(receipt["reproducibility"], "byte-identical-isolated-processes")
            self.assertFalse(receipt["modelAdmitted"])
            self.assertFalse(receipt["displayAuthorized"])

    def test_atomically_refuses_raced_lock_and_receipt_targets(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-derived-rebuild-") as temporary:
            fixture = Fixture(Path(temporary))
            original_writer = HARNESS._write_json_exclusive

            def raced_writer(path: Path, value: Any, label: str) -> None:
                path.write_bytes(b"racer owns this path\n")
                original_writer(path, value, label)

            with mock.patch.object(HARNESS, "_write_json_exclusive", side_effect=raced_writer):
                with self.assertRaisesRegex(ValueError, "derived lock must be fresh"):
                    fixture.create_lock()
            self.assertEqual(fixture.derived_lock_path.read_bytes(), b"racer owns this path\n")
            self.assertEqual(list(fixture.root.glob(".derived-lock.json.*.tmp")), [])

            fixture.derived_lock_path.unlink()
            fixture.create_lock()
            build_a = fixture.build_fixture(1)
            build_b = fixture.build_fixture(2)
            receipt_path = fixture.root / "observation.json"
            with mock.patch.object(HARNESS, "_write_json_exclusive", side_effect=raced_writer):
                with self.assertRaisesRegex(ValueError, "observation receipt must be fresh"):
                    HARNESS.observe_pair(
                        fixture.derived_lock_path,
                        fixture.base_lock_path,
                        fixture.base_source,
                        fixture.wheelhouse,
                        fixture.checkpoint,
                        build_a,
                        build_b,
                        receipt_path,
                        "fixture:1",
                        "fixture:2",
                        fixture=True,
                        allow_fixture=True,
                    )
            self.assertEqual(receipt_path.read_bytes(), b"racer owns this path\n")
            self.assertEqual(list(fixture.root.glob(".observation.json.*.tmp")), [])

    def test_rejects_base_checkpoint_receipt_and_harness_drift(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-derived-rebuild-") as temporary:
            fixture = Fixture(Path(temporary))
            fixture.create_lock()

            config = fixture.checkpoint / "config.json"
            original = config.read_bytes()
            config.write_bytes(b"drift\n")
            with self.assertRaisesRegex(ValueError, "artifact closure"):
                fixture.verify()
            config.write_bytes(original)

            license_path = fixture.base_source / "README.md"
            original_license = license_path.read_bytes()
            license_path.write_bytes(b"changed license evidence\n")
            with self.assertRaisesRegex(ValueError, "source byte or hash mismatch"):
                fixture.verify()
            license_path.write_bytes(original_license)

            receipt_path = fixture.checkpoint / HARNESS.TRAINING_RECEIPT
            original_receipt = receipt_path.read_bytes()
            changed = {**fixture.training_receipt, "modelAdmitted": True}
            receipt_path.write_text(json.dumps(changed) + "\n")
            with self.assertRaisesRegex(ValueError, "cannot admit|receipt hash differs"):
                fixture.verify()
            receipt_path.write_bytes(original_receipt)

            lock = json.loads(fixture.derived_lock_path.read_text())
            payload = {key: lock[key] for key in lock if key != "contentSha256"}
            payload["rebuild"]["harness"]["sha256"] = "0" * 64
            fixture.derived_lock_path.write_text(json.dumps(HARNESS.seal(payload)) + "\n")
            with self.assertRaisesRegex(ValueError, "provenance differs"):
                fixture.verify()

    def test_rejects_unsafe_or_extra_checkpoint_files(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-derived-rebuild-") as temporary:
            fixture = Fixture(Path(temporary))
            for name, message in (
                ("weights.pth", "pickle"),
                ("decoder.onnx_data", "external-data"),
                ("other-receipt.json", "exactly one"),
            ):
                path = fixture.checkpoint / name
                path.write_bytes(b"unsafe\n")
                with self.assertRaisesRegex(ValueError, message):
                    fixture.create_lock(fixture.root / f"{name}.lock.json")
                path.unlink()

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks are unavailable")
    def test_rejects_symlinks_and_output_overlap(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-derived-rebuild-") as temporary:
            fixture = Fixture(Path(temporary))
            target = fixture.root / "outside.txt"
            target.write_text("outside\n")
            (fixture.checkpoint / "linked.txt").symlink_to(target)
            with self.assertRaisesRegex(ValueError, "symlink"):
                fixture.create_lock()
            (fixture.checkpoint / "linked.txt").unlink()
            with self.assertRaisesRegex(ValueError, "overlaps"):
                fixture.create_lock(fixture.checkpoint / "derived-lock.json")

    def test_rejects_nonidentical_builds_and_extra_runtime_files(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-derived-rebuild-") as temporary:
            fixture = Fixture(Path(temporary))
            fixture.create_lock()
            build_a = fixture.build_fixture(1)
            build_b = fixture.build_fixture(2)
            encoder = build_b / "raw" / "encoder_model.onnx"
            encoder.write_text("different\n")
            with self.assertRaisesRegex(ValueError, "non-identical intermediate"):
                HARNESS.observe_pair(
                    fixture.derived_lock_path,
                    fixture.base_lock_path,
                    fixture.base_source,
                    fixture.wheelhouse,
                    fixture.checkpoint,
                    build_a,
                    build_b,
                    fixture.root / "first-observation.json",
                    "fixture:1",
                    "fixture:2",
                    fixture=True,
                    allow_fixture=True,
                )
            encoder.write_text("encoder_model.onnx\n")
            extra = build_b / "staged" / "unexpected.bin"
            extra.write_bytes(b"unsafe\n")
            with self.assertRaisesRegex(ValueError, "runtime closure differs"):
                HARNESS.observe_pair(
                    fixture.derived_lock_path,
                    fixture.base_lock_path,
                    fixture.base_source,
                    fixture.wheelhouse,
                    fixture.checkpoint,
                    build_a,
                    build_b,
                    fixture.root / "second-observation.json",
                    "fixture:1",
                    "fixture:2",
                    fixture=True,
                    allow_fixture=True,
                )


if __name__ == "__main__":
    unittest.main()
