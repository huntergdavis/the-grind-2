from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any


SCRIPT = Path(__file__).with_name("rebuild.py")
SPEC = importlib.util.spec_from_file_location(
    "_grind2_factual_story_beat_v2_rebuild_test_subject",
    SCRIPT,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("cannot load factual story-beat V2 rebuild wrapper")
harness = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(harness)

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


def sealed_case(
    case_id: str,
    split: str,
    prompt: str,
    target: str,
) -> dict[str, Any]:
    payload = {
        "id": case_id,
        "split": split,
        "prompt": prompt,
        "target": target,
    }
    return {**payload, "caseHash": harness.TRAINER.canonical_hash(payload)}


def sealed_corpus() -> dict[str, Any]:
    payload = {
        "schemaVersion": 2,
        "cases": [
            sealed_case(
                "factual:train:01",
                "train",
                "Write one factual sentence.\nPLACE: Moonkennel\nMECHANIC: stamina 8 -> 6",
                "At Moonkennel, the runner spends 2 stamina.",
            ),
            sealed_case(
                "factual:dev:01",
                "dev",
                "Write one factual sentence.\nPLACE: Glassmere\nMECHANIC: renown 3 -> 4",
                "At Glassmere, the victory raises renown from 3 to 4.",
            ),
        ],
    }
    return {**payload, "corpusHash": harness.TRAINER.canonical_hash(payload)}


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
        for name, contents in {
            "README.md": "SPDX-License-Identifier: Apache-2.0\n",
            "config.json": '{"model_type":"t5"}\n',
            "tokenizer.json": "{}\n",
            "tokenizer_config.json": "{}\n",
        }.items():
            (self.base_source / name).write_text(contents, encoding="utf-8")
        (self.base_source / "model.safetensors").write_bytes(b"base weights\n")
        (self.wheelhouse / "fixture.whl").write_bytes(b"wheel\n")

        committed = json.loads(
            (
                harness.REPOSITORY_ROOT / harness.BASE_LOCK_RELATIVE
            ).read_text(encoding="utf-8")
        )
        source_manifest = harness.regular_file_manifest(self.base_source)
        wheel_manifest = harness.regular_file_manifest(self.wheelhouse)
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
                "totalBytes": sum(
                    item["byteLength"] for item in wheel_manifest
                ),
            },
        }
        self.base_lock_path.write_text(
            json.dumps(self.base_lock) + "\n",
            encoding="utf-8",
        )
        corpus = sealed_corpus()
        self.corpus_path.write_text(
            json.dumps(corpus, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        for name, contents in {
            "config.json": "{}\n",
            "generation_config.json": "{}\n",
            "tokenizer.json": "{}\n",
            "tokenizer_config.json": "{}\n",
            "training-log.json": "{}\n",
        }.items():
            (self.checkpoint / name).write_text(contents, encoding="utf-8")
        (self.checkpoint / "model.safetensors").write_bytes(b"tuned weights\n")
        logs = [
            {
                "epoch": epoch,
                "meanTrainLoss": float(4 - epoch),
                "optimizerSteps": epoch,
            }
            for epoch in range(1, harness.TRAINER.EPOCHS + 1)
        ]
        packages = {
            "python": self.base_lock["platform"]["pythonVersion"],
            "torch": harness.locked_package_version(self.base_lock, "torch"),
            "transformers": harness.locked_package_version(
                self.base_lock,
                "transformers",
            ),
            "tokenizers": harness.locked_package_version(
                self.base_lock,
                "tokenizers",
            ),
            "safetensors": harness.locked_package_version(
                self.base_lock,
                "safetensors",
            ),
        }
        self.training_receipt = harness.TRAINER.make_receipt(
            source=self.base_source,
            source_files=source_manifest,
            corpus_path=self.corpus_path,
            corpus=corpus,
            destination=self.checkpoint,
            train_losses=[entry["meanTrainLoss"] for entry in logs],
            dev_loss=0.2,
            logs=logs,
            package_versions=packages,
        )
        (self.checkpoint / harness.TRAINING_RECEIPT).write_text(
            json.dumps(self.training_receipt) + "\n",
            encoding="utf-8",
        )

    def create_lock(self, output: Path | None = None) -> dict[str, Any]:
        return harness.create_lock(
            self.base_lock_path,
            self.base_source,
            self.wheelhouse,
            self.checkpoint,
            self.derived_lock_path if output is None else output,
            allow_fixture=True,
        )

    def build_fixture(self, ordinal: int) -> Path:
        build = self.root / f"build-{ordinal}"
        (build / "raw").mkdir(parents=True)
        (build / "staged").mkdir()
        (build / "logs").mkdir()
        for name in RAW_FILES:
            (build / "raw" / name).write_text(f"{name}\n", encoding="utf-8")
        for item in self.base_lock["runtimeFiles"]:
            path = build / "staged" / item["path"]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f"{item['path']}\n", encoding="utf-8")
        (build / "logs" / f"build-{ordinal}.stdout.log").write_text(
            "fixture stdout\n",
            encoding="utf-8",
        )
        (build / "logs" / f"build-{ordinal}.stderr.log").write_text(
            "fixture stderr\n",
            encoding="utf-8",
        )
        (build / "build-process.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "runId": f"fixture:{ordinal}",
                "ordinal": ordinal,
                "pythonProcessId": ordinal,
                "pythonHashSeed": self.base_lock["platform"]["pythonHashSeed"],
            }) + "\n",
            encoding="utf-8",
        )
        return build


class FactualV2RebuildTest(unittest.TestCase):
    def test_pins_both_proven_dependencies_and_locks_the_v2_profile(self) -> None:
        self.assertEqual(harness.sha256_file(harness.CORE_PATH), harness.CORE_SHA256)
        self.assertEqual(
            harness.sha256_file(
                harness.REPOSITORY_ROOT / harness.TRAINING_HARNESS_RELATIVE
            ),
            harness.TRAINING_HARNESS_SHA256,
        )
        harness.verify_core()
        self.assertEqual(harness.profile(), {
            "schemaVersion": 2,
            "lockKind": "factual-story-beat-v2-derived-q8-rebuild-lock",
            "receiptKind": "factual-story-beat-v2-derived-q8-rebuild-receipt",
            "coreSha256": harness.CORE_SHA256,
            "trainingHarness": {
                "path": "tools/narrator-story-beat-v2-training/train.py",
                "sha256": harness.TRAINING_HARNESS_SHA256,
            },
            "derivedHarness": "tools/narrator-story-beat-v2-rebuild/rebuild.py",
            "importedHistoricalFunctions": ["build_once", "observed_run"],
            "modelAdmitted": False,
            "displayAuthorized": False,
        })
        with tempfile.TemporaryDirectory(prefix="grind2-v2-rebuild-pin-") as temporary:
            changed = Path(temporary) / "rebuild.py"
            changed.write_bytes(harness.CORE_PATH.read_bytes() + b"\n# drift\n")
            with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                harness.verify_core(changed)

    def test_creates_deterministic_v2_lock_without_mutating_v1(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-v2-rebuild-") as temporary:
            fixture = Fixture(Path(temporary))
            first = fixture.create_lock()
            copy_path = fixture.root / "derived-lock-copy.json"
            second = fixture.create_lock(copy_path)
            self.assertEqual(first, second)
            self.assertEqual(
                fixture.derived_lock_path.read_bytes(),
                copy_path.read_bytes(),
            )
            self.assertEqual(first["schemaVersion"], 2)
            self.assertEqual(first["kind"], harness.LOCK_KIND)
            self.assertEqual(first["training"]["corpus"]["schemaVersion"], 2)
            self.assertEqual(
                first["training"]["receiptValidatorObservedAtDerivation"]["path"],
                harness.TRAINING_HARNESS_RELATIVE,
            )
            self.assertEqual(
                first["rebuild"]["harness"]["path"],
                harness.DERIVED_HARNESS_RELATIVE,
            )
            self.assertFalse(first["modelAdmitted"])
            self.assertFalse(first["displayAuthorized"])

            v1_path = (
                harness.REPOSITORY_ROOT
                / "tools/narrator-story-beat-rebuild/rebuild.py"
            )
            spec = importlib.util.spec_from_file_location(
                "_grind2_v1_rebuild_isolation_probe",
                v1_path,
            )
            assert spec is not None and spec.loader is not None
            v1 = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(v1)
            self.assertEqual(v1.SCHEMA_VERSION, 1)
            self.assertEqual(
                v1.TRAINING_HARNESS_RELATIVE,
                "tools/narrator-story-beat-training/train.py",
            )

    def test_rejects_v1_receipt_identity_and_authority_drift(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-v2-rebuild-") as temporary:
            fixture = Fixture(Path(temporary))
            receipt_path = fixture.checkpoint / harness.TRAINING_RECEIPT
            changed = {**fixture.training_receipt, "schemaVersion": 1}
            payload = {
                key: value
                for key, value in changed.items()
                if key != "receiptSha256"
            }
            changed["receiptSha256"] = harness.TRAINER.sha256_bytes(
                harness.TRAINER.stable_json_bytes(payload)
            )
            receipt_path.write_text(json.dumps(changed) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "schema version"):
                fixture.create_lock()

            receipt_path.write_text(
                json.dumps({**fixture.training_receipt, "modelAdmitted": True}) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "cannot admit|hash differs"):
                fixture.create_lock(fixture.root / "authority.lock.json")

    def test_observes_and_reverifies_a_distinct_v2_pair_receipt(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-v2-rebuild-") as temporary:
            fixture = Fixture(Path(temporary))
            fixture.create_lock()
            build_a = fixture.build_fixture(1)
            build_b = fixture.build_fixture(2)
            receipt_path = fixture.root / "pair-receipt.json"
            receipt = harness.observe_pair(
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
            self.assertEqual(receipt["schemaVersion"], 2)
            self.assertEqual(receipt["kind"], harness.RECEIPT_KIND)
            self.assertEqual(receipt["training"]["corpus"]["schemaVersion"], 2)
            self.assertFalse(receipt["modelAdmitted"])
            self.assertFalse(receipt["displayAuthorized"])
            self.assertEqual(
                harness.verify_pair(
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
                ),
                receipt,
            )


if __name__ == "__main__":
    unittest.main()
