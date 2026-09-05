"""Tests for the developer-only heldout story-beat evaluator."""

from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("evaluate.py")
SPEC = importlib.util.spec_from_file_location("story_beat_evaluate", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
evaluator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluator)


def make_case(index: int, split: str = "holdout") -> dict[str, object]:
    payload: dict[str, object] = {
        "id": f"story-beat-training-corpus-v1:holdout:{index:04d}",
        "split": split,
        "prompt": (
            "Write one sentence.\n"
            f'PLACE: "Holdout Place {index}"\n'
            f'HEADLINE: "Marker {index} settles."\n'
            "BEAT:"
        ),
        "target": f"At Holdout Place {index}, marker {index} settles.",
    }
    return {**payload, "caseHash": evaluator.canonical_hash(payload)}


def make_holdout(count: int = evaluator.HOLDOUT_CASE_COUNT) -> dict[str, object]:
    payload: dict[str, object] = {
        "schemaVersion": evaluator.SCHEMA_VERSION,
        "cases": [make_case(index) for index in range(count)],
    }
    return {**payload, "corpusHash": evaluator.canonical_hash(payload)}


def write_json(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + "\n",
        encoding="utf-8",
    )


def make_model(root: Path) -> Path:
    model = root / "checkpoint"
    model.mkdir()
    (model / "config.json").write_text('{"is_encoder_decoder":true}\n', encoding="utf-8")
    (model / "tokenizer.json").write_text('{"version":"fixture"}\n', encoding="utf-8")
    (model / "model.safetensors").write_bytes(b"safe fixture weights")
    return model


def reseal_row(row: dict[str, object]) -> None:
    payload = {key: value for key, value in row.items() if key != "rowHash"}
    row["rowHash"] = evaluator.canonical_hash(payload)


def reseal_evidence(evidence: dict[str, object]) -> None:
    payload = {key: value for key, value in evidence.items() if key != "contentHash"}
    evidence["contentHash"] = evaluator.canonical_hash(payload)


class HeldoutCorpusTests(unittest.TestCase):
    def test_canonical_hash_matches_repository_and_exporter(self) -> None:
        self.assertEqual(
            evaluator.canonical({"a": ["é", True], "z": 2}),
            '{"a":["é",true],"z":2}',
        )
        self.assertEqual(
            evaluator.canonical_hash({"a": ["é", True], "z": 2}),
            "9308d5cbedeb1b37",
        )
        with self.assertRaisesRegex(ValueError, "unsupported canonical value"):
            evaluator.canonical(1.5)

    def test_accepts_only_an_exact_hash_bound_200_row_holdout(self) -> None:
        valid = make_holdout()
        self.assertIs(evaluator.validate_holdout(valid), valid)

        too_short = make_holdout(evaluator.HOLDOUT_CASE_COUNT - 1)
        with self.assertRaisesRegex(ValueError, "exactly 200"):
            evaluator.validate_holdout(too_short)

        train_case = copy.deepcopy(valid)
        train_case["cases"][0]["split"] = "train"  # type: ignore[index]
        case = train_case["cases"][0]  # type: ignore[index]
        case["caseHash"] = evaluator.canonical_hash(evaluator.case_payload(case))
        train_case["corpusHash"] = evaluator.canonical_hash(
            evaluator.corpus_payload(train_case)
        )
        with self.assertRaisesRegex(ValueError, "must be holdout"):
            evaluator.validate_holdout(train_case)

        extra = copy.deepcopy(valid)
        extra["cases"][0]["surprise"] = True  # type: ignore[index]
        extra["corpusHash"] = evaluator.canonical_hash(evaluator.corpus_payload(extra))
        with self.assertRaisesRegex(ValueError, "keys differ"):
            evaluator.validate_holdout(extra)

        wrong_hash = copy.deepcopy(valid)
        wrong_hash["cases"][1]["caseHash"] = "0" * 16  # type: ignore[index]
        with self.assertRaisesRegex(ValueError, "caseHash differs"):
            evaluator.validate_holdout(wrong_hash)

    def test_json_loader_rejects_duplicate_keys_and_nonfinite_numbers(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            duplicate = root / "duplicate.json"
            duplicate.write_text('{"schemaVersion":1,"schemaVersion":1}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
                evaluator.load_json(duplicate, "fixture")

            nonfinite = root / "nonfinite.json"
            nonfinite.write_text('{"elapsed":NaN}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "non-finite JSON"):
                evaluator.load_json(nonfinite, "fixture")

    def test_subset_selection_is_stable_and_full_mode_covers_every_case(self) -> None:
        holdout = make_holdout()
        first, first_receipt = evaluator.select_cases(holdout, 7)
        second, second_receipt = evaluator.select_cases(copy.deepcopy(holdout), 7)
        self.assertEqual(first, second)
        self.assertEqual(first_receipt, second_receipt)
        self.assertEqual(len(first), 7)
        self.assertEqual(
            first_receipt["selectedIdsHash"],
            evaluator.canonical_hash([entry[1]["id"] for entry in first]),
        )

        full, full_receipt = evaluator.select_cases(
            holdout, evaluator.HOLDOUT_CASE_COUNT
        )
        self.assertEqual(len(full), evaluator.HOLDOUT_CASE_COUNT)
        self.assertEqual(
            {entry[1]["id"] for entry in full},
            {case["id"] for case in holdout["cases"]},
        )
        self.assertEqual(full_receipt["selectedCaseCount"], 200)
        for invalid in (0, 201, True, 1.5):
            with self.assertRaisesRegex(ValueError, "case count"):
                evaluator.select_cases(holdout, invalid)

        arguments = evaluator.parse_args([
            "--holdout",
            "sealed.json",
            "--model",
            "checkpoint",
            "--output",
            "results.json",
        ])
        self.assertEqual(arguments.case_count, evaluator.HOLDOUT_CASE_COUNT)


class ModelAndEvidenceTests(unittest.TestCase):
    def fixture(
        self,
        root: Path,
        case_count: int = 3,
    ) -> tuple[
        Path,
        dict[str, object],
        Path,
        list[dict[str, object]],
        dict[str, object],
    ]:
        holdout = make_holdout()
        holdout_path = root / "sealed-holdout.json"
        write_json(holdout_path, holdout)
        model = make_model(root)
        model_files = evaluator.validate_model(model)
        selected, selection = evaluator.select_cases(holdout, case_count)
        rows = [
            evaluator.make_result_row(
                ordinal=ordinal,
                source_ordinal=source_ordinal,
                case=case,
                rank_hash=rank_hash,
                input_token_count=12,
                generated_token_count=8,
                output=f"Generated fixture {ordinal}.",
                elapsed_microseconds=ordinal + 11,
            )
            for ordinal, (source_ordinal, case, rank_hash) in enumerate(selected)
        ]
        evidence = evaluator.build_evidence(
            model=model,
            model_files=model_files,
            holdout_path=holdout_path,
            holdout=holdout,
            selection=selection,
            rows=rows,
        )
        return holdout_path, holdout, model, model_files, evidence

    def test_model_closure_requires_safetensors_and_rejects_pickle_and_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model = make_model(root)
            files = evaluator.validate_model(model)
            self.assertEqual(
                {entry["path"] for entry in files},
                {"config.json", "model.safetensors", "tokenizer.json"},
            )

            (model / "weights.bin").write_bytes(b"pickle")
            with self.assertRaisesRegex(ValueError, "pickle"):
                evaluator.validate_model(model)
            (model / "weights.bin").unlink()

            target = root / "outside.txt"
            target.write_text("outside", encoding="utf-8")
            (model / "linked.txt").symlink_to(target)
            with self.assertRaisesRegex(ValueError, "symlink"):
                evaluator.validate_model(model)

    def test_validates_complete_evidence_and_rejects_drift_or_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            holdout_path, holdout, model, model_files, evidence = self.fixture(root)
            self.assertIs(
                evaluator.validate_evidence(
                    evidence,
                    model=model,
                    model_files=model_files,
                    holdout_path=holdout_path,
                    holdout=holdout,
                ),
                evidence,
            )

            overbudget = copy.deepcopy(evidence)
            overbudget["rows"][0]["generatedTokenCount"] = 49
            reseal_row(overbudget["rows"][0])
            reseal_evidence(overbudget)
            with self.assertRaisesRegex(ValueError, "0..48"):
                evaluator.validate_evidence(overbudget, holdout=holdout)

            changed_output = copy.deepcopy(evidence)
            changed_output["rows"][0]["output"] = "Changed but unhashed."
            reseal_row(changed_output["rows"][0])
            reseal_evidence(changed_output)
            with self.assertRaisesRegex(ValueError, "outputSha256 differs"):
                evaluator.validate_evidence(changed_output, holdout=holdout)

            extra = copy.deepcopy(evidence)
            extra["authority"] = True
            reseal_evidence(extra)
            with self.assertRaisesRegex(ValueError, "keys differ"):
                evaluator.validate_evidence(extra)

            nonfinite = copy.deepcopy(evidence)
            nonfinite["rows"][0]["elapsedMicroseconds"] = math.inf
            with self.assertRaises(ValueError):
                evaluator.validate_evidence(nonfinite)

            drifted_files = copy.deepcopy(model_files)
            drifted_files[0]["sha256"] = "0" * 64
            with self.assertRaisesRegex(ValueError, "model closure differs"):
                evaluator.validate_evidence(
                    evidence,
                    model=model,
                    model_files=drifted_files,
                )

    def test_validate_only_checks_real_closures_without_importing_ml(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            holdout_path, _, model, _, _ = self.fixture(root)
            output = root / "fresh-evaluation.json"
            before_torch = sys.modules.get("torch")
            before_transformers = sys.modules.get("transformers")
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = evaluator.main([
                    "--validate-only",
                    "--holdout",
                    str(holdout_path),
                    "--model",
                    str(model),
                    "--output",
                    str(output),
                    "--case-count",
                    "5",
                ])
            self.assertEqual(code, 0)
            report = json.loads(stdout.getvalue())
            self.assertEqual(report["holdoutRows"], 200)
            self.assertEqual(report["selectedRows"], 5)
            self.assertFalse(report["mlPackagesImported"])
            self.assertFalse(output.exists())
            self.assertIs(sys.modules.get("torch"), before_torch)
            self.assertIs(sys.modules.get("transformers"), before_transformers)

    def test_paths_reject_existing_output_traversal_and_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            holdout_path, _, model, _, _ = self.fixture(root)
            output = root / "evidence.json"
            evaluator.validate_paths(holdout_path, model, output)
            output.write_text("occupied", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "fresh"):
                evaluator.validate_paths(holdout_path, model, output)
            with self.assertRaisesRegex(ValueError, "traversal"):
                evaluator.checked_path("../escape.json", "output")

            link = root / "model-link"
            link.symlink_to(model, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symlink"):
                evaluator.checked_path(str(link), "model")


if __name__ == "__main__":
    unittest.main()
