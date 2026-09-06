from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest import mock

TRAINER_PATH = Path(__file__).with_name("train.py")
TRAINER_SPEC = importlib.util.spec_from_file_location(
    "_grind2_factual_story_beat_v2_train_test_subject",
    TRAINER_PATH,
)
if TRAINER_SPEC is None or TRAINER_SPEC.loader is None:
    raise RuntimeError("cannot load factual story-beat V2 trainer")
harness = importlib.util.module_from_spec(TRAINER_SPEC)
TRAINER_SPEC.loader.exec_module(harness)


def sealed_case(
    case_id: str,
    split: str,
    prompt: str,
    target: str,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": case_id,
        "split": split,
        "prompt": prompt,
        "target": target,
    }
    return {**payload, "caseHash": harness.canonical_hash(payload)}


def sealed_corpus(
    cases: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    rows = cases or [
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
    ]
    payload: dict[str, object] = {
        "schemaVersion": 2,
        "cases": rows,
    }
    return {**payload, "corpusHash": harness.canonical_hash(payload)}


def write_corpus(
    path: Path,
    corpus: dict[str, object] | None = None,
) -> dict[str, object]:
    value = corpus or sealed_corpus()
    path.write_text(json.dumps(value, ensure_ascii=False) + "\n", encoding="utf-8")
    return value


def create_source(path: Path) -> None:
    path.mkdir()
    (path / "config.json").write_text('{"model_type":"t5"}\n', encoding="utf-8")
    (path / "tokenizer.json").write_text("{}\n", encoding="utf-8")
    (path / "model.safetensors").write_bytes(b"fixture weights\n")


class FakeTokenizer:
    def __init__(self, lengths: dict[str, int]) -> None:
        self.lengths = lengths

    def __call__(self, text: str, **kwargs: object) -> dict[str, list[int]]:
        self.last_kwargs = kwargs
        return {"input_ids": list(range(self.lengths[text]))}


class CorePinTest(unittest.TestCase):
    def test_pins_the_complete_proven_v1_training_core(self) -> None:
        self.assertEqual(harness.sha256_file(harness.CORE_PATH), harness.CORE_SHA256)
        harness.verify_core()
        with tempfile.TemporaryDirectory(prefix="grind2-v2-core-pin-") as temporary:
            changed = Path(temporary) / "train.py"
            changed.write_bytes(harness.CORE_PATH.read_bytes() + b"\n# changed\n")
            with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                harness.verify_core(changed)


class ProfileBoundaryTest(unittest.TestCase):
    def test_locks_v2_schema_and_384_48_recipe(self) -> None:
        self.assertEqual(harness.CORPUS_SCHEMA_VERSION, 2)
        self.assertEqual(harness.RECEIPT_SCHEMA_VERSION, 2)
        self.assertEqual(harness.SEED, 20260906)
        self.assertEqual(harness.MAX_SOURCE_TOKENS, 384)
        self.assertEqual(harness.MAX_TARGET_TOKENS, 48)
        self.assertEqual(harness.recipe()["maximumSourceTokens"], 384)
        self.assertEqual(harness.recipe()["maximumTargetTokens"], 48)
        self.assertFalse(harness.recipe()["truncation"])

    def test_emits_distinct_factual_progress_without_authority(self) -> None:
        output = StringIO()
        with redirect_stdout(output):
            harness.emit_epoch_progress({
                "epoch": 2,
                "meanTrainLoss": 1.25,
                "optimizerSteps": 16,
            })
        self.assertEqual(
            json.loads(output.getvalue()),
            {
                "kind": "factual-story-beat-v2-training-progress",
                "epoch": 2,
                "epochs": 3,
                "meanTrainLoss": 1.25,
                "optimizerSteps": 16,
            },
        )


class CorpusBoundaryTest(unittest.TestCase):
    def test_accepts_exact_v2_train_dev_envelope(self) -> None:
        corpus = sealed_corpus()
        self.assertIs(harness.validate_corpus(corpus), corpus)
        self.assertEqual(
            {case["split"] for case in corpus["cases"]},
            {"train", "dev"},
        )

    def test_rejects_v1_schema_holdout_and_duplicate_ids(self) -> None:
        corpus = sealed_corpus()
        v1_payload = {"schemaVersion": 1, "cases": corpus["cases"]}
        with self.assertRaisesRegex(ValueError, "schema version"):
            harness.validate_corpus({
                **v1_payload,
                "corpusHash": harness.canonical_hash(v1_payload),
            })

        holdout = sealed_case(
            "factual:holdout:01",
            "holdout",
            "PLACE: Vault",
            "The latch rests.",
        )
        holdout_payload = {
            "schemaVersion": 2,
            "cases": [corpus["cases"][0], holdout],
        }
        with self.assertRaisesRegex(ValueError, "sealed holdout rows are forbidden"):
            harness.validate_corpus({
                **holdout_payload,
                "corpusHash": harness.canonical_hash(holdout_payload),
            })

        duplicate = {
            **corpus["cases"][1],
            "id": corpus["cases"][0]["id"],
        }
        duplicate_payload_without_hash = {
            key: duplicate[key]
            for key in ("id", "split", "prompt", "target")
        }
        duplicate["caseHash"] = harness.canonical_hash(duplicate_payload_without_hash)
        duplicate_payload = {
            "schemaVersion": 2,
            "cases": [corpus["cases"][0], duplicate],
        }
        with self.assertRaisesRegex(ValueError, "duplicate case ids"):
            harness.validate_corpus({
                **duplicate_payload,
                "corpusHash": harness.canonical_hash(duplicate_payload),
            })


class TokenBoundaryTest(unittest.TestCase):
    def test_accepts_exact_384_48_limits_without_truncation(self) -> None:
        corpus = sealed_corpus()
        lengths = {
            case[field]: maximum
            for case in corpus["cases"]
            for field, maximum in (
                ("prompt", harness.MAX_SOURCE_TOKENS),
                ("target", harness.MAX_TARGET_TOKENS),
            )
        }
        tokenizer = FakeTokenizer(lengths)
        rows = harness.tokenize_cases(tokenizer, corpus)
        self.assertEqual(len(rows), 2)
        self.assertFalse(tokenizer.last_kwargs["truncation"])

    def test_rejects_385_source_and_49_target_tokens(self) -> None:
        corpus = sealed_corpus()
        base = {
            case[field]: maximum
            for case in corpus["cases"]
            for field, maximum in (
                ("prompt", harness.MAX_SOURCE_TOKENS),
                ("target", harness.MAX_TARGET_TOKENS),
            )
        }
        source_overflow = dict(base)
        source_overflow[corpus["cases"][0]["prompt"]] = 385
        with self.assertRaisesRegex(ValueError, "prompt has 385 tokens"):
            harness.tokenize_cases(FakeTokenizer(source_overflow), corpus)
        target_overflow = dict(base)
        target_overflow[corpus["cases"][0]["target"]] = 49
        with self.assertRaisesRegex(ValueError, "target has 49 tokens"):
            harness.tokenize_cases(FakeTokenizer(target_overflow), corpus)


class OfflineAndReceiptBoundaryTest(unittest.TestCase):
    def test_requires_v2_hash_seed_and_forces_offline_mode(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "PYTHONHASHSEED must be 20260906"):
                harness.enforce_offline_environment()
        with mock.patch.dict(
            os.environ,
            {"PYTHONHASHSEED": str(harness.SEED)},
            clear=True,
        ):
            harness.enforce_offline_environment()
            self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")
            self.assertEqual(os.environ["TRANSFORMERS_OFFLINE"], "1")

    def test_receipt_binds_v2_recipe_and_keeps_authority_false(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-v2-receipt-") as temporary:
            root = Path(temporary)
            source = root / "source"
            create_source(source)
            corpus_path = root / "train-dev.json"
            corpus = write_corpus(corpus_path)
            destination = root / "output"
            destination.mkdir()
            (destination / "config.json").write_text("{}\n", encoding="utf-8")
            (destination / "tokenizer.json").write_text("{}\n", encoding="utf-8")
            (destination / "model.safetensors").write_bytes(b"trained fixture\n")
            (destination / harness.LOG_FILE).write_text("{}\n", encoding="utf-8")
            logs = [
                {
                    "epoch": epoch,
                    "meanTrainLoss": float(4 - epoch),
                    "optimizerSteps": epoch,
                }
                for epoch in range(1, harness.EPOCHS + 1)
            ]
            receipt = harness.make_receipt(
                source=source,
                source_files=harness.validate_source(source),
                corpus_path=corpus_path,
                corpus=corpus,
                destination=destination,
                train_losses=[entry["meanTrainLoss"] for entry in logs],
                dev_loss=0.75,
                logs=logs,
                package_versions={
                    "python": "3.fixture",
                    "torch": "fixture",
                    "transformers": "fixture",
                    "tokenizers": "fixture",
                    "safetensors": "fixture",
                },
            )
            self.assertEqual(receipt["schemaVersion"], 2)
            self.assertEqual(receipt["corpus"]["schemaVersion"], 2)
            self.assertEqual(receipt["recipe"]["maximumSourceTokens"], 384)
            self.assertEqual(receipt["recipe"]["maximumTargetTokens"], 48)
            self.assertIs(receipt["modelAdmitted"], False)
            self.assertIs(receipt["displayAuthorized"], False)
            self.assertIs(harness.validate_receipt(destination, receipt), receipt)


class ValidateOnlyCliTest(unittest.TestCase):
    def test_validates_without_ml_imports_or_creating_destination(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-v2-train-cli-") as temporary:
            root = Path(temporary)
            corpus = root / "train-dev.json"
            source = root / "source"
            destination = root / "output"
            write_corpus(corpus)
            create_source(source)
            command = [
                sys.executable,
                str(Path(__file__).with_name("train.py")),
                "--validate-only",
                "--corpus",
                str(corpus),
                "--source",
                str(source),
                "--destination",
                str(destination),
            ]
            result = subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
            )
            summary = json.loads(result.stdout)
            self.assertEqual(summary["schemaVersion"], 2)
            self.assertEqual(
                summary["rows"],
                {"dev": 1, "total": 2, "train": 1},
            )
            self.assertEqual(summary["profile"]["maximumSourceTokens"], 384)
            self.assertEqual(summary["profile"]["maximumTargetTokens"], 48)
            self.assertEqual(summary["profile"]["coreSha256"], harness.CORE_SHA256)
            self.assertFalse(summary["mlPackagesImported"])
            self.assertFalse(summary["modelAdmitted"])
            self.assertFalse(summary["displayAuthorized"])
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
