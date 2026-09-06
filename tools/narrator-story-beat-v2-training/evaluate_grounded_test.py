"""Tests for grounded factual story-beat V2 heldout evidence generation."""

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


MODULE_PATH = Path(__file__).with_name("evaluate_grounded.py")
SPEC = importlib.util.spec_from_file_location(
    "factual_story_beat_v2_grounded_evaluate_test_subject",
    MODULE_PATH,
)
assert SPEC is not None and SPEC.loader is not None
evaluator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluator)


def prompt(index: int = 0, lens: str = "contrast") -> str:
    cost = (
        None
        if lens == "consequence"
        else f"mana falls from {14 + index} to {12 + index}"
    )
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


def facts(index: int = 0, lens: str = "contrast") -> dict[str, object]:
    return evaluator.factual_story_beat_facts_from_prompt(prompt(index, lens))


def make_case(index: int, split: str = "holdout") -> dict[str, object]:
    lens = ("cost", "consequence", "contrast")[index % 3]
    payload: dict[str, object] = {
        "id": (
            "factual-story-beat-training-corpus-v2:"
            f"holdout:{index:04d}"
        ),
        "split": split,
        "prompt": prompt(index, lens),
        "target": (
            f"At Violet Estuary {index}, Miro maps while "
            f"route distance rises from {index} to {index + 1}."
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
    (model / "model.safetensors").write_bytes(b"grounded factual V2 weights")
    return model


class FakeMatrix:
    def __init__(self, rows: list[list[int | float]]) -> None:
        self.rows = [list(row) for row in rows]
        self.shape = (len(rows), len(rows[0]) if rows else 0)

    def __getitem__(self, key: object) -> object:
        if isinstance(key, tuple):
            row, column = key
            return self.rows[row][column]
        return list(self.rows[key])

    def __setitem__(self, key: tuple[int, int], value: int | float) -> None:
        row, column = key
        self.rows[row][column] = value

    def fill_(self, value: int | float) -> "FakeMatrix":
        for row in self.rows:
            for index in range(len(row)):
                row[index] = value
        return self


class GroundedTokenizerFixture:
    def __init__(self, forms: tuple[object, ...]) -> None:
        self.by_text = {
            form.text: (index + 10, evaluator.EOS_TOKEN_ID)
            for index, form in enumerate(forms)
        }
        self.by_ids = {ids: text for text, ids in self.by_text.items()}

    def __call__(self, text: str, **options: object) -> dict[str, FakeMatrix]:
        if options != {
            "add_special_tokens": True,
            "padding": False,
            "truncation": False,
            "return_tensors": "pt",
        }:
            raise AssertionError(f"unexpected tokenizer options: {options}")
        return {"input_ids": FakeMatrix([list(self.by_text[text])])}

    def decode(self, token_ids: list[int], **options: object) -> str:
        if options != {
            "skip_special_tokens": True,
            "clean_up_tokenization_spaces": False,
        }:
            raise AssertionError(f"unexpected decode options: {options}")
        return self.by_ids[tuple(token_ids)]


class GroundedContractTests(unittest.TestCase):
    def test_pins_raw_evaluator_and_locks_grounded_contract(self) -> None:
        self.assertEqual(
            evaluator.sha256_file(evaluator.RAW_EVALUATOR_PATH),
            evaluator.RAW_EVALUATOR_SHA256,
        )
        evaluator.verify_raw_evaluator()
        with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
            evaluator.verify_raw_evaluator(
                evaluator.RAW_EVALUATOR_PATH,
                "0" * 64,
            )
        self.assertEqual(
            evaluator.raw_evaluator.generation_contract()["groundingConstraint"],
            "none-unconstrained-pass-through-v2",
        )
        contract = evaluator.generation_contract()
        self.assertEqual(contract["seed"], 20260906)
        self.assertEqual(contract["maximumInputTokens"], 384)
        self.assertEqual(contract["maximumNewTokens"], 48)
        self.assertEqual(
            contract["groundingConstraint"],
            "factual-v2-eligible-form-token-trie-v1",
        )
        self.assertEqual(
            contract["presentationSequence"],
            "location-shell-connector-6-slot-v2",
        )
        self.assertEqual(
            contract["targetTokenization"],
            "host-derived-exact-roundtrip-forms-v2",
        )
        self.assertEqual(contract["exactTopScoreTiePolicy"], "reject-v1")

    def test_builds_only_bounded_exactly_grounded_forms_for_every_lens(self) -> None:
        expected_counts = {"cost": 24, "consequence": 24, "contrast": 18}
        for lens, expected_count in expected_counts.items():
            with self.subTest(lens=lens):
                supplied = facts(lens=lens)
                forms = evaluator.story_beat_forms(supplied)
                clauses = [
                    value
                    for value in (
                        supplied["requiredCost"],
                        supplied["requiredConsequence"],
                    )
                    if value is not None
                ]
                self.assertEqual(len(forms), expected_count)
                self.assertEqual(len({form.form_id for form in forms}), expected_count)
                self.assertEqual(len({form.text for form in forms}), expected_count)
                self.assertEqual(
                    {
                        f"{form.location_shell}-{form.join}"
                        for form in forms
                    },
                    set(evaluator.FRAME_IDS),
                )
                self.assertTrue(all(
                    form.text.count(str(supplied["location"])) == 1
                    and all(str(clause) in form.text for clause in clauses)
                    and len(evaluator._core.STORY_BEAT_WORD_PATTERN.findall(form.text))
                    <= 24
                    for form in forms
                ))
        contrast = evaluator.story_beat_forms(facts(lens="contrast"))
        self.assertEqual(
            contrast[0].text,
            "At Violet Estuary 0, Miro maps as mana falls from 14 to 12 and "
            "ability experience rises from 9 to 11.",
        )
        self.assertEqual(
            contrast[-1].text,
            "The route opens 0 while mana falls from 14 to 12 and ability "
            "experience rises from 9 to 11 at Violet Estuary 0.",
        )

    def test_rotates_six_frames_and_rejects_hostile_fact_shapes(self) -> None:
        supplied = facts(lens="contrast")
        decisions = [
            evaluator.select_story_beat_form_eligibility(supplied, slot)
            for slot in range(7)
        ]
        self.assertEqual(
            [decision.selected_bucket_id for decision in decisions[:6]],
            list(evaluator.FRAME_IDS),
        )
        self.assertEqual(decisions[6].selected_bucket_id, evaluator.FRAME_IDS[0])
        self.assertTrue(all(len(decision.forms) == 3 for decision in decisions))
        for decision in decisions:
            shell, connector = decision.selected_bucket_id.split("-", 1)
            self.assertTrue(all(
                form.location_shell == shell and form.join == connector
                for form in decision.forms
            ))
        for invalid in (-1, True, 1.5):
            with self.assertRaisesRegex(ValueError, "sequence slot"):
                evaluator.select_story_beat_form_eligibility(supplied, invalid)
        extra = {**supplied, "referenceTarget": "never expose this"}
        with self.assertRaisesRegex(ValueError, "facts differ"):
            evaluator.story_beat_forms(extra)
        unmarked = {**supplied, "action": "Miro maps the tidal lines."}
        with self.assertRaisesRegex(ValueError, "authored marker"):
            evaluator.story_beat_forms(unmarked)

    def test_tokenizes_only_the_rotated_target_free_candidates(self) -> None:
        supplied = facts(lens="contrast")
        eligible = evaluator.select_story_beat_form_eligibility(
            supplied,
            0,
        ).forms
        tokenizer = GroundedTokenizerFixture(eligible)
        targets = evaluator.tokenize_story_beat_targets(
            tokenizer,
            supplied,
            0,
            "fixture",
        )
        self.assertEqual(
            [target.form_id for target in targets],
            [form.form_id for form in eligible],
        )
        self.assertEqual(
            [target.text for target in targets],
            [form.text for form in eligible],
        )
        self.assertTrue(all(
            target.token_ids[-1] == evaluator.EOS_TOKEN_ID
            for target in targets
        ))

    def test_reuses_trie_masking_and_rejects_exact_model_score_ties(self) -> None:
        targets = (
            evaluator.StoryBeatTokenTarget("left", "Left.", (4, 5, 1)),
            evaluator.StoryBeatTokenTarget("right", "Right.", (4, 6, 1)),
        )
        processor = evaluator.GroundedStoryBeatLogitsProcessor(targets)
        root_scores = FakeMatrix([[0.0] * 8])
        root_scores[0, 4] = 0.25
        self.assertIs(
            processor(FakeMatrix([[0]]), root_scores),
            root_scores,
        )
        self.assertEqual(root_scores.rows[0][4], 0.25)
        self.assertTrue(all(
            math.isinf(score) and score < 0
            for index, score in enumerate(root_scores.rows[0])
            if index != 4
        ))
        tied_scores = FakeMatrix([[0.0] * 8])
        tied_scores[0, 5] = 0.5
        tied_scores[0, 6] = 0.5
        with self.assertRaisesRegex(ValueError, "exact top-score tie"):
            processor(FakeMatrix([[0, 4]]), tied_scores)


class GroundedEvidenceTests(unittest.TestCase):
    def test_validates_all_200_fixture_prompts_and_grounded_form_sets(self) -> None:
        holdout = make_holdout()
        self.assertIs(evaluator.validate_holdout(holdout), holdout)
        malformed = copy.deepcopy(holdout)
        malformed["cases"][0]["prompt"] = malformed["cases"][0][
            "prompt"
        ].replace(" gracefully ", " plainly ", 1)
        malformed["cases"][0]["caseHash"] = evaluator.canonical_hash({
            key: value
            for key, value in malformed["cases"][0].items()
            if key != "caseHash"
        })
        malformed["corpusHash"] = evaluator.canonical_hash({
            "schemaVersion": malformed["schemaVersion"],
            "cases": malformed["cases"],
        })
        with self.assertRaisesRegex(ValueError, "authored marker"):
            evaluator.validate_holdout(malformed)

    def test_builds_and_revalidates_grounded_schema_2_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model = make_model(root)
            holdout_path = root / "sealed-holdout.json"
            holdout = make_holdout()
            write_json(holdout_path, holdout)
            files = evaluator.validate_model(model)
            selected, selection = evaluator.select_cases(holdout, 1)
            source_ordinal, case, rank_hash = selected[0]
            supplied = evaluator.factual_story_beat_facts_from_prompt(
                case["prompt"],
            )
            output = evaluator.select_story_beat_form_eligibility(
                supplied,
                0,
            ).forms[0].text
            row = evaluator.make_result_row(
                ordinal=0,
                source_ordinal=source_ordinal,
                case=case,
                rank_hash=rank_hash,
                input_token_count=200,
                generated_token_count=20,
                output=output,
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
            self.assertEqual(
                evidence["contract"]["groundingConstraint"],
                "factual-v2-eligible-form-token-trie-v1",
            )
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
                evaluator.validate_evidence(
                    hostile,
                    model=model,
                    model_files=files,
                    holdout_path=holdout_path,
                    holdout=holdout,
                )

    def test_validate_only_imports_no_ml_and_writes_no_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model = make_model(root)
            holdout_path = root / "sealed-holdout.json"
            output = root / "grounded-evidence.json"
            write_json(holdout_path, make_holdout())
            before_torch = sys.modules.get("torch")
            before_transformers = sys.modules.get("transformers")
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
            self.assertIs(sys.modules.get("torch"), before_torch)
            self.assertIs(sys.modules.get("transformers"), before_transformers)


if __name__ == "__main__":
    unittest.main()
