#!/usr/bin/env python3
"""Generate grounded FP32 evidence for the sealed factual story-beat V2 holdout."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
import unicodedata
from collections.abc import Mapping
from pathlib import Path
from types import ModuleType
from typing import Any


RAW_EVALUATOR_PATH = Path(__file__).resolve().with_name("evaluate.py")
RAW_EVALUATOR_SHA256 = (
    "305f35a9f86f3e565cf76b0aa2f3ea96a4122ebd755c7ab08527b5dd2828cf6f"
)
FRAME_IDS = (
    "prefix-as",
    "prefix-while",
    "interior-as",
    "interior-while",
    "suffix-as",
    "suffix-while",
)
FACT_KEYS = frozenset({
    "location",
    "headline",
    "action",
    "consequence",
    "lens",
    "requiredCost",
    "requiredConsequence",
})


def fail(message: str) -> None:
    raise ValueError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
    except OSError as error:
        fail(f"cannot read pinned factual V2 raw evaluator: {error}")
    return digest.hexdigest()


def verify_raw_evaluator(
    path: Path = RAW_EVALUATOR_PATH,
    expected_sha256: str = RAW_EVALUATOR_SHA256,
) -> None:
    if path.is_symlink() or not path.is_file():
        fail("pinned factual V2 raw evaluator must be a regular file")
    if sha256_file(path) != expected_sha256:
        fail("pinned factual V2 raw evaluator SHA-256 differs")


def load_raw_evaluator() -> ModuleType:
    verify_raw_evaluator()
    spec = importlib.util.spec_from_file_location(
        "_grind2_factual_story_beat_v2_raw_evaluator",
        RAW_EVALUATOR_PATH,
    )
    if spec is None or spec.loader is None:
        fail("cannot load pinned factual V2 raw evaluator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


raw_evaluator = load_raw_evaluator()
_core = raw_evaluator.load_core()

SCHEMA_VERSION = raw_evaluator.SCHEMA_VERSION
SEED = raw_evaluator.SEED
HOLDOUT_CASE_COUNT = raw_evaluator.HOLDOUT_CASE_COUNT
MAX_SOURCE_TOKENS = raw_evaluator.MAX_SOURCE_TOKENS
MAX_NEW_TOKENS = raw_evaluator.MAX_NEW_TOKENS
MAX_PROMPT_CHARACTERS = raw_evaluator.MAX_PROMPT_CHARACTERS
MAX_TARGET_CHARACTERS = raw_evaluator.MAX_TARGET_CHARACTERS
DECODER_START_TOKEN_ID = raw_evaluator.DECODER_START_TOKEN_ID
PAD_TOKEN_ID = _core.PAD_TOKEN_ID
EOS_TOKEN_ID = raw_evaluator.EOS_TOKEN_ID
PROMPT_INSTRUCTION = raw_evaluator.PROMPT_INSTRUCTION

_core.SCHEMA_VERSION = SCHEMA_VERSION
_core.SEED = SEED
_core.HOLDOUT_CASE_COUNT = HOLDOUT_CASE_COUNT
_core.MAX_SOURCE_TOKENS = MAX_SOURCE_TOKENS
_core.MAX_NEW_TOKENS = MAX_NEW_TOKENS
_core.MAX_PROMPT_CHARACTERS = MAX_PROMPT_CHARACTERS
_core.MAX_TARGET_CHARACTERS = MAX_TARGET_CHARACTERS
_core.ID_PATTERN = raw_evaluator.ID_PATTERN

canonical = _core.canonical
canonical_hash = _core.canonical_hash
checked_path = _core.checked_path
load_json = _core.load_json
validate_model = _core.validate_model
validate_paths = _core.validate_paths
select_cases = _core.select_cases
model_evidence = _core.model_evidence
make_result_row = _core.make_result_row
factual_story_beat_facts_from_prompt = (
    raw_evaluator.factual_story_beat_facts_from_prompt
)
StoryBeatForm = _core.StoryBeatForm
StoryBeatFormEligibility = _core.StoryBeatFormEligibility
StoryBeatTokenTarget = _core.StoryBeatTokenTarget
GroundedStoryBeatLogitsProcessor = _core.GroundedStoryBeatLogitsProcessor


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    )


def _validated_facts(facts: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(facts, Mapping) or set(facts) != FACT_KEYS:
        fail("grounded factual V2 facts differ")
    try:
        prompt = "\n".join((
            PROMPT_INSTRUCTION,
            *(
                f"{prefix}{_canonical_json(facts[field])}"
                for prefix, field, _expected in raw_evaluator.PROMPT_LABELS
            ),
            "BEAT:",
        ))
    except (TypeError, ValueError):
        fail("grounded factual V2 facts cannot form a canonical prompt")
    checked = factual_story_beat_facts_from_prompt(prompt)
    if any(checked[key] != facts[key] for key in FACT_KEYS):
        fail("grounded factual V2 facts differ after validation")
    return checked


def _without_terminal(value: str, label: str) -> str:
    if len(value) <= 1 or value[-1] not in ".!?":
        fail(f"grounded factual V2 {label} lacks a terminal sentence mark")
    return value[:-1]


def _compact_action(action: str) -> str:
    fragment = _without_terminal(action, "action")
    marker = " gracefully "
    if fragment.count(marker) != 1:
        fail("grounded factual V2 action lacks its exact authored marker")
    actor, remainder = fragment.split(marker, 1)
    actor_words = _core.STORY_BEAT_WORD_PATTERN.findall(actor)
    remainder_words = _core.STORY_BEAT_WORD_PATTERN.findall(remainder)
    if not actor_words or not remainder_words:
        fail("grounded factual V2 action cannot be compacted")
    return f"{actor_words[0]} {remainder_words[0]}"


def _narrative_fragments(facts: Mapping[str, Any]) -> tuple[tuple[str, str, str], ...]:
    action = _without_terminal(facts["action"], "action")
    headline = _without_terminal(facts["headline"], "headline")
    consequence = _without_terminal(facts["consequence"], "consequence")
    compact_action = _compact_action(facts["action"])
    candidates = (
        ("action", action, action),
        ("compact-action", compact_action, compact_action),
        ("headline", headline, _core._lower_initial(headline)),
        ("consequence", consequence, _core._lower_initial(consequence)),
    )
    seen: set[tuple[str, str]] = set()
    result: list[tuple[str, str, str]] = []
    for source_id, ordinary, after_prefix in candidates:
        identity = (ordinary, after_prefix)
        if identity in seen:
            continue
        seen.add(identity)
        result.append((source_id, ordinary, after_prefix))
    return tuple(result)


def _required_clauses(facts: Mapping[str, Any]) -> tuple[str, ...]:
    clauses = tuple(
        value
        for value in (facts["requiredCost"], facts["requiredConsequence"])
        if value is not None
    )
    if len(clauses) not in (1, 2):
        fail("grounded factual V2 required clauses differ")
    return clauses


def _render_form(
    location: str,
    shell: str,
    fragment: str,
    connector: str,
    mechanic: str,
) -> str:
    if shell == "prefix":
        return f"At {location}, {fragment} {connector} {mechanic}."
    if shell == "interior":
        return f"{fragment} at {location} {connector} {mechanic}."
    if shell == "suffix":
        return f"{fragment} {connector} {mechanic} at {location}."
    fail("grounded factual V2 location shell is unknown")


def _valid_form(value: str, location: str, clauses: tuple[str, ...]) -> bool:
    lower = value.casefold()
    return (
        0 < _core.utf16_length(value) <= MAX_TARGET_CHARACTERS
        and value == value.strip()
        and value == unicodedata.normalize("NFC", value)
        and not _core._has_unsafe_unicode(value, allow_line_feed=False)
        and "\n" not in value
        and "  " not in value
        and value[0].isupper()
        and value.endswith(".")
        and value.count(location) == 1
        and all(lower.count(clause.casefold()) == 1 for clause in clauses)
        and len(_core.STORY_BEAT_WORD_PATTERN.findall(value)) <= 24
    )


def story_beat_forms(facts_value: Mapping[str, Any]) -> tuple[Any, ...]:
    """Build only target-free forms from exact public narrative/mechanic facts."""
    facts = _validated_facts(facts_value)
    location = facts["location"]
    clauses = _required_clauses(facts)
    mechanic = " and ".join(clauses)
    fragments = _narrative_fragments(facts)
    forms: list[Any] = []
    seen_text: set[str] = set()
    for frame_id in FRAME_IDS:
        shell, connector = frame_id.split("-", 1)
        for source_id, ordinary, after_prefix in fragments:
            fragment = after_prefix if shell == "prefix" else ordinary
            text = _render_form(
                location,
                shell,
                fragment,
                connector,
                mechanic,
            )
            if text in seen_text or not _valid_form(text, location, clauses):
                continue
            seen_text.add(text)
            forms.append(StoryBeatForm(
                form_id=f"{frame_id}-{source_id}",
                location_shell=shell,
                frame_id=source_id,
                first=source_id,
                join=connector,
                second="mechanic",
                text=text,
            ))
    if not forms:
        fail("grounded factual V2 facts have no bounded forms")
    available_frames = {
        f"{form.location_shell}-{form.join}"
        for form in forms
    }
    if available_frames != set(FRAME_IDS):
        fail("grounded factual V2 forms do not cover every presentation frame")
    return tuple(forms)


def select_story_beat_form_eligibility(
    facts: Mapping[str, Any],
    sequence_slot: int,
) -> Any:
    if (
        isinstance(sequence_slot, bool)
        or not isinstance(sequence_slot, int)
        or sequence_slot < 0
    ):
        fail("grounded factual V2 presentation sequence slot is invalid")
    forms = story_beat_forms(facts)
    requested_index = sequence_slot % len(FRAME_IDS)
    requested_id = FRAME_IDS[requested_index]
    for offset in range(len(FRAME_IDS)):
        bucket_id = FRAME_IDS[(requested_index + offset) % len(FRAME_IDS)]
        shell, connector = bucket_id.split("-", 1)
        eligible = tuple(
            form
            for form in forms
            if form.location_shell == shell and form.join == connector
        )
        if eligible:
            return StoryBeatFormEligibility(
                schema_version=SCHEMA_VERSION,
                sequence_slot=sequence_slot,
                requested_bucket_id=requested_id,
                selected_bucket_id=bucket_id,
                forms=eligible,
            )
    return StoryBeatFormEligibility(
        schema_version=SCHEMA_VERSION,
        sequence_slot=sequence_slot,
        requested_bucket_id=requested_id,
        selected_bucket_id=None,
        forms=(),
    )


_base_validate_holdout = _core.validate_holdout


def validate_factual_holdout(value: Any) -> dict[str, Any]:
    checked = _base_validate_holdout(value)
    for case in checked["cases"]:
        facts = factual_story_beat_facts_from_prompt(case["prompt"])
        story_beat_forms(facts)
    return checked


def generation_contract() -> dict[str, Any]:
    return {
        "seed": SEED,
        "device": "cpu",
        "dtype": "float32",
        "offline": True,
        "deterministicAlgorithms": True,
        "intraopThreads": _core.CPU_THREADS,
        "interopThreads": _core.CPU_INTEROP_THREADS,
        "maximumInputTokens": MAX_SOURCE_TOKENS,
        "maximumNewTokens": MAX_NEW_TOKENS,
        "doSample": False,
        "numBeams": 1,
        "numReturnSequences": 1,
        "cleanUpTokenizationSpaces": False,
        "groundingConstraint": "factual-v2-eligible-form-token-trie-v1",
        "presentationSequence": "location-shell-connector-6-slot-v2",
        "targetTokenization": "host-derived-exact-roundtrip-forms-v2",
        "exactTopScoreTiePolicy": "reject-v1",
        "returnDictInGenerate": False,
        "minLength": 0,
        "minNewTokens": 0,
        "repetitionPenalty": 1,
        "noRepeatNgramSize": 0,
        "encoderNoRepeatNgramSize": 0,
        "badWordsIds": None,
        "forceWordsIds": None,
        "forcedBosTokenId": None,
        "forcedEosTokenId": None,
        "suppressTokens": None,
        "beginSuppressTokens": None,
        "guidanceScale": None,
        "decoderStartTokenId": DECODER_START_TOKEN_ID,
        "padTokenId": PAD_TOKEN_ID,
        "eosTokenId": EOS_TOKEN_ID,
    }


_core.STORY_BEAT_PROMPT_INSTRUCTION = PROMPT_INSTRUCTION
_core.story_beat_facts_from_prompt = factual_story_beat_facts_from_prompt
_core.select_story_beat_form_eligibility = select_story_beat_form_eligibility
_core.generation_contract = generation_contract
_core.validate_holdout = validate_factual_holdout

tokenize_story_beat_targets = _core.tokenize_story_beat_targets
validate_holdout = validate_factual_holdout
load_holdout = _core.load_holdout
build_evidence = _core.build_evidence
validate_evidence = _core.validate_evidence


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--holdout",
        required=True,
        help="separately sealed 200-row factual V2 holdout JSON",
    )
    parser.add_argument(
        "--model",
        required=True,
        help="local factual V2 safetensors checkpoint",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="fresh grounded V2 evidence JSON file",
    )
    parser.add_argument(
        "--case-count",
        type=int,
        default=HOLDOUT_CASE_COUNT,
        help=f"deterministic smoke subset size; default/full is {HOLDOUT_CASE_COUNT}",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="validate closures, forms and selection without importing ML packages",
    )
    return parser.parse_args(argv)


_core.parse_args = parse_args


def main(argv: list[str] | None = None) -> int:
    return _core.main(argv)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(
            f"grounded factual story-beat V2 evaluation refused: {error}",
            file=sys.stderr,
        )
        raise SystemExit(2)
