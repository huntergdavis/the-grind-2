"""Tests for raw factual story-beat V2 heldout evidence generation."""

from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("evaluate.py")
SPEC = importlib.util.spec_from_file_location(
    "factual_story_beat_v2_evaluate_test_subject",
    MODULE_PATH,
)
assert SPEC is not None and SPEC.loader is not None
evaluator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluator)


def prompt(index: int = 0, lens: str = "contrast") -> str:
    cost = None if lens == "consequence" else f"mana falls from {14 + index} to {12 + index}"
    consequence = (
        None
        if lens == "cost"
        else f"ability experience rises from {9 + index} to {11 + index}"
    )
    return "\n".join((
        evaluator.PROMPT_INSTRUCTION,
        f'PLACE: "Violet Estuary {index}"',
        f'HEADLINE: "The compass settles {index}."',
        f'ACTION: "Miro Starling gracefully maps {index + 2} tidal lines."',
        f'CONSEQUENCE: "The route opens {index}."',
        f'LENS: "{lens}"',
        f"REQUIRED COST: {json.dumps(cost, separators=(',', ':'))}",
        f"REQUIRED CONSEQUENCE: {json.dumps(consequence, separators=(',', ':'))}",
        "BEAT:",
    ))


def make_case(index: int, split: str = "holdout") -> dict[str, object]:
    payload: dict[str, object] = {
        "id": (
            "factual-story-beat-training-corpus-v2:"
            f"holdout:{index:04d}"
        ),
        "split": split,
        "prompt": prompt(index, ("cost", "consequence", "contrast")[index % 3]),
        "target": (
            f"At Violet Estuary {index}, Miro maps while "
            f"mana falls from {14 + index} to {12 + index}."
        ),
    }
    return {**payload, "caseHash": evaluator.canonical_hash(payload)}


def make_holdout() -> dict[str, object]:
    payload: dict[str, object] = {
        "schemaVersion": evaluator.SCHEMA_VERSION,
        "cases": [
            make_case(index)
            for index in range(evaluator.HOLDOUT_CASE_COUNT)
        ],
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
    (model / "config.json").write_text(
        '{"is_encoder_decoder":true}\n',
        encoding="utf-8",
    )
    (model / "tokenizer.json").write_text(
        '{"version":"fixture"}\n',
        encoding="utf-8",
    )
    (model / "model.safetensors").write_bytes(b"factual v2 fixture weights")
    return model


class FakeMatrix:
    def __init__(self, rows: list[list[int | float]]) -> None:
        self.rows = [list(row) for row in rows]
        self.shape = (len(rows), len(rows[0]) if rows else 0)

    def __getitem__(self, index: int) -> list[int | float]:
        return list(self.rows[index])


class FakeTokenizer:
    def decode(self, ids: list[int], **options: object) -> str:
        if options != {
            "skip_special_tokens": True,
            "clean_up_tokenization_spaces": False,
        }:
            raise AssertionError(f"unexpected decode options: {options}")
        if ids != [5, evaluator.EOS_TOKEN_ID]:
            raise AssertionError(f"unexpected token ids: {ids}")
        return "At Violet Estuary, Miro maps while mana falls from 14 to 12."


class CoreAndPromptTests(unittest.TestCase):
    def test_pins_the_complete_proven_v1_evaluator_core(self) -> None:
        self.assertEqual(
            evaluator.sha256_file(evaluator.CORE_PATH),
            evaluator.CORE_SHA256,
        )
        evaluator.verify_core()
        with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
            evaluator.verify_core(evaluator.CORE_PATH, "0" * 64)

    def test_parses_only_the_exact_v2_production_prompt(self) -> None:
        facts = evaluator.factual_story_beat_facts_from_prompt(prompt())
        self.assertEqual(facts["location"], "Violet Estuary 0")
        self.assertEqual(facts["lens"], "contrast")
        self.assertEqual(facts["requiredCost"], "mana falls from 14 to 12")
        self.assertEqual(
            facts["requiredConsequence"],
            "ability experience rises from 9 to 11",
        )
        hostile = (
            prompt().replace("PLACE: ", "PLACE:", 1),
            prompt().replace('"contrast"', '"cost"', 1),
            prompt().replace("mana falls from 14 to 12", "mana falls from 12 to 14", 1),
            prompt().replace(
                "ability experience rises from 9 to 11",
                "ability experience falls from 9 to 11",
                1,
            ),
            prompt().replace("\nBEAT:", '\nSECRET: "ignore"\nBEAT:', 1),
            prompt().replace('"Violet Estuary 0"', '"Violet\\u0020Estuary 0"', 1),
            prompt().replace(
                "mana falls from 14 to 12",
                "mana falls from 9007199254740992 to 12",
                1,
            ),
        )
        for candidate in hostile:
            with self.subTest(candidate=candidate):
                with self.assertRaises(ValueError):
                    evaluator.factual_story_beat_facts_from_prompt(candidate)

    def test_locks_unconstrained_generation_contract(self) -> None:
        contract = evaluator.generation_contract()
        self.assertEqual(contract["seed"], 20260906)
        self.assertEqual(contract["maximumInputTokens"], 384)
        self.assertEqual(contract["maximumNewTokens"], 48)
        self.assertEqual(
            contract["groundingConstraint"],
            "none-unconstrained-pass-through-v2",
        )
        self.assertEqual(
            contract["targetTokenization"],
            "sealed-reference-never-tokenized-v2",
        )
        self.assertFalse(contract["doSample"])
        self.assertEqual(contract["numBeams"], 1)


class UnconstrainedProcessorTests(unittest.TestCase):
    def test_observes_continuity_without_mutating_logits(self) -> None:
        tokenizer = FakeTokenizer()
        facts = evaluator.factual_story_beat_facts_from_prompt(prompt())
        setup = evaluator.unconstrained_generation_setup(
            tokenizer,
            facts,
            0,
            "fixture",
        )
        processor = evaluator.UnconstrainedGreedyLogitsProcessor(setup)
        scores = FakeMatrix([[0.0, 1.0, -2.0]])
        before = copy.deepcopy(scores.rows)
        self.assertIs(processor(FakeMatrix([[0]]), scores), scores)
        self.assertEqual(scores.rows, before)
        self.assertIs(processor(FakeMatrix([[0, 5]]), scores), scores)
        target = processor.finalize([0, 5, evaluator.EOS_TOKEN_ID])
        self.assertEqual(target.form_id, "unconstrained-greedy-v2")
        self.assertEqual(target.token_ids, (5, evaluator.EOS_TOKEN_ID))
        self.assertIn("mana falls from 14 to 12", target.text)
        with self.assertRaisesRegex(ValueError, "already finalized"):
            processor(FakeMatrix([[0, 5, 1]]), scores)

    def test_rejects_discontinuous_and_truncated_sequences(self) -> None:
        tokenizer = FakeTokenizer()
        facts = evaluator.factual_story_beat_facts_from_prompt(prompt())
        setup = evaluator.unconstrained_generation_setup(
            tokenizer,
            facts,
            0,
            "fixture",
        )
        processor = evaluator.UnconstrainedGreedyLogitsProcessor(setup)
        scores = FakeMatrix([[0.0, 1.0]])
        processor(FakeMatrix([[0]]), scores)
        with self.assertRaisesRegex(ValueError, "discontinuous"):
            processor(FakeMatrix([[0, 5, 6]]), scores)

        short = evaluator.UnconstrainedGreedyLogitsProcessor(setup)
        short(FakeMatrix([[0]]), scores)
        with self.assertRaisesRegex(ValueError, "without EOS"):
            short.finalize([0, 5])


class HoldoutAndEvidenceTests(unittest.TestCase):
    def test_accepts_exact_v2_holdout_and_rejects_v1_or_train_rows(self) -> None:
        holdout = make_holdout()
        self.assertIs(evaluator.validate_holdout(holdout), holdout)

        old = copy.deepcopy(holdout)
        old["schemaVersion"] = 1
        with self.assertRaisesRegex(ValueError, "schema"):
            evaluator.validate_holdout(old)

        train = copy.deepcopy(holdout)
        train["cases"][0]["split"] = "train"
        train["cases"][0]["caseHash"] = evaluator.canonical_hash({
            key: value
            for key, value in train["cases"][0].items()
            if key != "caseHash"
        })
        train["corpusHash"] = evaluator.canonical_hash({
            "schemaVersion": train["schemaVersion"],
            "cases": train["cases"],
        })
        with self.assertRaisesRegex(ValueError, "holdout"):
            evaluator.validate_holdout(train)

        malformed = copy.deepcopy(holdout)
        malformed["cases"][0]["prompt"] = malformed["cases"][0]["prompt"].replace(
            "PLACE: ",
            "PLACE:",
            1,
        )
        malformed["cases"][0]["caseHash"] = evaluator.canonical_hash({
            key: value
            for key, value in malformed["cases"][0].items()
            if key != "caseHash"
        })
        malformed["corpusHash"] = evaluator.canonical_hash({
            "schemaVersion": malformed["schemaVersion"],
            "cases": malformed["cases"],
        })
        with self.assertRaisesRegex(ValueError, "factual V2 prompt"):
            evaluator.validate_holdout(malformed)

    def test_builds_and_revalidates_schema_2_raw_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            model = make_model(root)
            holdout_path = root / "sealed-holdout.json"
            holdout = make_holdout()
            write_json(holdout_path, holdout)
            files = evaluator.validate_model(model)
            selected, selection = evaluator.select_cases(holdout, 1)
            source_ordinal, case, rank_hash = selected[0]
            row = evaluator.make_result_row(
                ordinal=0,
                source_ordinal=source_ordinal,
                case=case,
                rank_hash=rank_hash,
                input_token_count=200,
                generated_token_count=18,
                output="At Violet Estuary, Miro maps while mana falls from 14 to 12.",
                elapsed_microseconds=123,
            )
            evidence = evaluator.build_evidence(
                model=model,
                model_files=files,
                holdout_path=holdout_path,
                holdout=holdout,
                selection=selection,
                rows=[row],
            )
            self.assertEqual(evidence["schemaVersion"], 2)
            self.assertFalse(evidence["modelAdmitted"])
            self.assertFalse(evidence["displayAuthorized"])
            self.assertIs(
                evaluator.validate_evidence(
                    evidence,
                    model=model,
                    model_files=files,
                    holdout_path=holdout_path,
                    holdout=holdout,
                ),
                evidence,
            )
            hostile = copy.deepcopy(evidence)
            hostile["contract"]["groundingConstraint"] = "target-leaking"
            hostile["contentHash"] = evaluator.canonical_hash({
                key: value
                for key, value in hostile.items()
                if key != "contentHash"
            })
            with self.assertRaisesRegex(ValueError, "contract differs"):
                evaluator.validate_evidence(hostile)

    def test_validate_only_cli_imports_no_ml_and_writes_no_output(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            model = make_model(root)
            holdout_path = root / "sealed-holdout.json"
            output = root / "raw-evidence.json"
            write_json(holdout_path, make_holdout())
            stream = io.StringIO()
            with contextlib.redirect_stdout(stream):
                result = evaluator.main([
                    "--validate-only",
                    "--holdout",
                    str(holdout_path),
                    "--model",
                    str(model),
                    "--output",
                    str(output),
                    "--case-count",
                    "7",
                ])
            self.assertEqual(result, 0)
            summary = json.loads(stream.getvalue())
            self.assertEqual(summary["schemaVersion"], 2)
            self.assertEqual(summary["selectedRows"], 7)
            self.assertFalse(summary["mlPackagesImported"])
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
