from __future__ import annotations

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

sys.path.insert(0, str(Path(__file__).parent))
import train as harness


def sealed_case(case_id: str, split: str, prompt: str, target: str) -> dict[str, object]:
    payload: dict[str, object] = {
        "id": case_id,
        "split": split,
        "prompt": prompt,
        "target": target,
    }
    return {**payload, "caseHash": harness.canonical_hash(payload)}


def sealed_corpus(cases: list[dict[str, object]] | None = None) -> dict[str, object]:
    rows = cases or [
        sealed_case(
            "story-beat-train-01",
            "train",
            "Write one grounded sentence.\nPLACE: Moonkennel",
            "At Moonkennel, the marked trap springs.",
        ),
        sealed_case(
            "story-beat-dev-01",
            "dev",
            "Write one grounded sentence.\nPLACE: Glassmere",
            "A silver latch settles at Glassmere.",
        ),
    ]
    payload: dict[str, object] = {"schemaVersion": 1, "cases": rows}
    return {**payload, "corpusHash": harness.canonical_hash(payload)}


def write_corpus(path: Path, corpus: dict[str, object] | None = None) -> dict[str, object]:
    value = corpus or sealed_corpus()
    path.write_text(json.dumps(value, ensure_ascii=False) + "\n", encoding="utf-8")
    return value


def create_source(path: Path) -> None:
    path.mkdir()
    (path / "config.json").write_text('{"model_type":"t5"}\n', encoding="utf-8")
    (path / "tokenizer.json").write_text("{}\n", encoding="utf-8")
    (path / "model.safetensors").write_bytes(b"fixture weights\n")


def reseal_receipt(receipt: dict[str, object]) -> dict[str, object]:
    payload = {key: value for key, value in receipt.items() if key != "receiptSha256"}
    return {**payload, "receiptSha256": harness.sha256_bytes(harness.stable_json_bytes(payload))}


class CanonicalHashTest(unittest.TestCase):
    def test_matches_locked_typescript_compatible_vectors(self) -> None:
        self.assertEqual(harness.canonical({"a": 1, "b": "é"}), '{"a":1,"b":"é"}')
        self.assertEqual(harness.canonical_hash({"a": 1, "b": "é"}), "eb6380263cd847f9")
        self.assertEqual(
            harness.canonical_hash({"schemaVersion": 1, "cases": []}),
            "3960878e4e7aa692",
        )

    def test_rejects_floats_and_unsafe_integers(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported canonical value"):
            harness.canonical(1.5)
        with self.assertRaisesRegex(ValueError, "safe-integer"):
            harness.canonical(harness.JS_SAFE_INTEGER + 1)


class CorpusBoundaryTest(unittest.TestCase):
    def test_locks_exporter_character_boundaries(self) -> None:
        self.assertEqual(harness.MAX_PROMPT_CHARACTERS, 2400)
        self.assertEqual(harness.MAX_TARGET_CHARACTERS, 160)
        self.assertEqual(harness.utf16_length("A😀"), 3)
        with self.assertRaisesRegex(ValueError, "1..160 characters"):
            harness.bounded_text(
                "a" + ("😀" * 80),
                "astral target",
                160,
                allow_line_feed=False,
            )

    def test_accepts_exact_train_dev_envelope(self) -> None:
        corpus = sealed_corpus()
        self.assertIs(harness.validate_corpus(corpus), corpus)
        self.assertEqual({case["split"] for case in corpus["cases"]}, {"train", "dev"})

    def test_rejects_extra_missing_bad_hash_and_sealed_holdout(self) -> None:
        valid = sealed_corpus()
        with self.assertRaisesRegex(ValueError, "keys differ"):
            harness.validate_corpus({**valid, "secret": "no"})
        missing = dict(valid)
        del missing["corpusHash"]
        with self.assertRaisesRegex(ValueError, "keys differ"):
            harness.validate_corpus(missing)
        with self.assertRaisesRegex(ValueError, "corpusHash differs"):
            harness.validate_corpus({**valid, "corpusHash": "0" * 16})
        boolean_version_payload = {"schemaVersion": True, "cases": valid["cases"]}
        with self.assertRaisesRegex(ValueError, "schema version"):
            harness.validate_corpus({
                **boolean_version_payload,
                "corpusHash": harness.canonical_hash(boolean_version_payload),
            })

        holdout = sealed_case("story-beat-holdout-01", "holdout", "PLACE: Vault", "The latch rests.")
        envelope = {"schemaVersion": 1, "cases": [valid["cases"][0], holdout]}
        with self.assertRaisesRegex(ValueError, "sealed holdout rows are forbidden"):
            harness.validate_corpus({
                **envelope,
                "corpusHash": harness.canonical_hash(envelope),
            })

        non_text_split = dict(valid["cases"][0])
        non_text_split["split"] = ["train"]
        with self.assertRaisesRegex(ValueError, "split must be train or dev"):
            harness.validate_case(non_text_split, 0)

    def test_rejects_duplicate_rows_and_hostile_text(self) -> None:
        train = sealed_case("train-one", "train", "Prompt one", "Target one.")
        duplicate_pair = sealed_case("dev-two", "dev", "Prompt one", "Target one.")
        payload = {"schemaVersion": 1, "cases": [train, duplicate_pair]}
        with self.assertRaisesRegex(ValueError, "duplicate prompts"):
            harness.validate_corpus({**payload, "corpusHash": harness.canonical_hash(payload)})

        duplicate_id = sealed_case("train-one", "dev", "Prompt two", "Target two.")
        payload = {"schemaVersion": 1, "cases": [train, duplicate_id]}
        with self.assertRaisesRegex(ValueError, "duplicate case ids"):
            harness.validate_corpus({**payload, "corpusHash": harness.canonical_hash(payload)})

        hostile = sealed_case("dev-hostile", "dev", "Prompt\u202ehidden", "Target.")
        payload = {"schemaVersion": 1, "cases": [train, hostile]}
        with self.assertRaisesRegex(ValueError, "unsafe Unicode"):
            harness.validate_corpus({**payload, "corpusHash": harness.canonical_hash(payload)})

        multiline_target = sealed_case("dev-lines", "dev", "Prompt two", "Target\nsecond line.")
        payload = {"schemaVersion": 1, "cases": [train, multiline_target]}
        with self.assertRaisesRegex(ValueError, "unsafe Unicode"):
            harness.validate_corpus({**payload, "corpusHash": harness.canonical_hash(payload)})

    def test_rejects_duplicate_json_object_keys(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-story-train-json-") as temporary:
            path = Path(temporary) / "corpus.json"
            path.write_text('{"schemaVersion":1,"schemaVersion":1,"corpusHash":"0","cases":[]}')
            with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
                harness.load_json(path, "corpus")


class FakeTokenizer:
    def __init__(self, lengths: dict[str, int]) -> None:
        self.lengths = lengths

    def __call__(self, text: str, **kwargs: object) -> dict[str, list[int]]:
        self.last_kwargs = kwargs
        return {"input_ids": list(range(self.lengths[text]))}


class TokenBoundaryTest(unittest.TestCase):
    def test_accepts_exact_limits_without_truncation(self) -> None:
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

    def test_rejects_source_and_target_overflow(self) -> None:
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
        source_overflow[corpus["cases"][0]["prompt"]] = harness.MAX_SOURCE_TOKENS + 1
        with self.assertRaisesRegex(ValueError, "prompt has 321 tokens"):
            harness.tokenize_cases(FakeTokenizer(source_overflow), corpus)

        target_overflow = dict(base)
        target_overflow[corpus["cases"][0]["target"]] = harness.MAX_TARGET_TOKENS + 1
        with self.assertRaisesRegex(ValueError, "target has 33 tokens"):
            harness.tokenize_cases(FakeTokenizer(target_overflow), corpus)


class PathBoundaryTest(unittest.TestCase):
    def test_rejects_existing_destination_and_traversal(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-story-train-path-") as temporary:
            root = Path(temporary)
            destination = root / "output"
            destination.mkdir()
            with self.assertRaisesRegex(ValueError, "must be fresh"):
                harness.validate_fresh_destination(destination)
            with self.assertRaisesRegex(ValueError, "traversal"):
                harness.checked_path("../outside", "destination")
            with self.assertRaisesRegex(ValueError, "unsafe"):
                harness.checked_path(r"unsafe\windows", "destination")

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks are unavailable")
    def test_rejects_symlinked_inputs_and_nested_source_symlinks(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-story-train-link-") as temporary:
            root = Path(temporary)
            corpus = root / "corpus.json"
            write_corpus(corpus)
            corpus_link = root / "corpus-link.json"
            corpus_link.symlink_to(corpus)
            with self.assertRaisesRegex(ValueError, "symlink"):
                harness.checked_path(str(corpus_link), "corpus")

            source = root / "source"
            create_source(source)
            (source / "leak").symlink_to(corpus)
            with self.assertRaisesRegex(ValueError, "symlink"):
                harness.validate_source(source)

    def test_requires_safetensors_and_rejects_pickle_source_weights(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-story-train-source-") as temporary:
            source = Path(temporary) / "source"
            create_source(source)
            (source / "pytorch_model.bin").write_bytes(b"pickle is not admitted")
            with self.assertRaisesRegex(ValueError, "pickle source weights are forbidden"):
                harness.validate_source(source)
            (source / "pytorch_model.bin").unlink()
            (source / "model.safetensors").unlink()
            with self.assertRaisesRegex(ValueError, "missing local safetensors"):
                harness.validate_source(source)


class ProgressBoundaryTest(unittest.TestCase):
    def test_emits_one_flushed_json_shape_per_epoch(self) -> None:
        output = StringIO()
        with redirect_stdout(output):
            harness.emit_epoch_progress({
                "epoch": 2,
                "meanTrainLoss": 1.25,
                "optimizerSteps": 8,
            })
        self.assertEqual(
            json.loads(output.getvalue()),
            {
                "kind": "story-beat-training-progress",
                "epoch": 2,
                "epochs": 3,
                "meanTrainLoss": 1.25,
                "optimizerSteps": 8,
            },
        )

    def test_requires_hash_seed_to_be_fixed_before_real_training(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "PYTHONHASHSEED must be 20260904"):
                harness.enforce_offline_environment()
        with mock.patch.dict(
            os.environ,
            {"PYTHONHASHSEED": str(harness.SEED)},
            clear=True,
        ):
            harness.enforce_offline_environment()
            self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")


class ReceiptBoundaryTest(unittest.TestCase):
    def fixture_receipt(self, root: Path) -> tuple[Path, dict[str, object]]:
        source = root / "source"
        create_source(source)
        corpus_path = root / "corpus.json"
        corpus = write_corpus(corpus_path)
        destination = root / "output"
        destination.mkdir()
        (destination / "config.json").write_text("{}\n")
        (destination / "tokenizer.json").write_text("{}\n")
        (destination / "model.safetensors").write_bytes(b"trained fixture\n")
        (destination / harness.LOG_FILE).write_text("{}\n")
        logs = [
            {"epoch": epoch, "meanTrainLoss": float(4 - epoch), "optimizerSteps": epoch}
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
        return destination, receipt

    def test_validates_exact_receipt_without_loading_a_model(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-story-train-receipt-") as temporary:
            destination, receipt = self.fixture_receipt(Path(temporary))
            self.assertIs(harness.validate_receipt(destination, receipt), receipt)
            (destination / harness.RECEIPT_FILE).write_text(json.dumps(receipt) + "\n")
            self.assertIs(harness.validate_receipt(destination, receipt), receipt)

    def test_rejects_receipt_mutation_and_artifact_drift(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-story-train-receipt-") as temporary:
            destination, receipt = self.fixture_receipt(Path(temporary))
            mutated = reseal_receipt({**receipt, "displayAuthorized": True})
            with self.assertRaisesRegex(ValueError, "cannot admit"):
                harness.validate_receipt(destination, mutated)
            extra = destination / "surprise.bin"
            extra.write_bytes(b"no")
            with self.assertRaisesRegex(ValueError, "artifact closure"):
                harness.validate_receipt(destination, receipt)


class ValidateOnlyCliTest(unittest.TestCase):
    def test_validate_only_uses_fixture_files_and_leaves_destination_fresh(self) -> None:
        with tempfile.TemporaryDirectory(prefix="grind2-story-train-cli-") as temporary:
            root = Path(temporary)
            corpus = root / "corpus.json"
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
            result = subprocess.run(command, check=True, capture_output=True, text=True)
            summary = json.loads(result.stdout)
            self.assertEqual(summary["rows"], {"dev": 1, "total": 2, "train": 1})
            self.assertFalse(summary["mlPackagesImported"])
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
