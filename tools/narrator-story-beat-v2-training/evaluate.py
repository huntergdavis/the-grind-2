#!/usr/bin/env python3
"""Generate raw, hash-bound FP32 evidence for the sealed factual story-beat V2 holdout."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
from collections.abc import Mapping
from pathlib import Path
from types import ModuleType
from typing import Any, NamedTuple


CORE_PATH = (
    Path(__file__).resolve().parent.parent
    / "narrator-story-beat-training"
    / "evaluate.py"
)
CORE_SHA256 = "429e41269f8f82f90b2271d2ab0961c855a28291b1eb26bb11bd57e176c10dc0"
SCHEMA_VERSION = 2
SEED = 20260906
HOLDOUT_CASE_COUNT = 200
MAX_SOURCE_TOKENS = 384
MAX_NEW_TOKENS = 48
MAX_PROMPT_CHARACTERS = 2_400
MAX_TARGET_CHARACTERS = 160
DECODER_START_TOKEN_ID = 0
EOS_TOKEN_ID = 1
JS_SAFE_INTEGER = 9_007_199_254_740_991

PROMPT_INSTRUCTION = (
    "Write one sentence of at most 24 words. Name the place, include every "
    "REQUIRED clause exactly, and connect it to supplied scene words. Add no "
    "dialogue, thoughts, future events, quests, rewards, relationships, or "
    "unsupplied harm."
)
PROMPT_LABELS = (
    ("PLACE: ", "location", str),
    ("HEADLINE: ", "headline", str),
    ("ACTION: ", "action", str),
    ("CONSEQUENCE: ", "consequence", str),
    ("LENS: ", "lens", str),
    ("REQUIRED COST: ", "requiredCost", (str, type(None))),
    (
        "REQUIRED CONSEQUENCE: ",
        "requiredConsequence",
        (str, type(None)),
    ),
)
NARRATIVE_LIMITS = {
    "location": 120,
    "headline": 160,
    "action": 240,
    "consequence": 280,
}
LENSES = frozenset({"cost", "consequence", "contrast"})
COST_PATTERN = re.compile(
    r"^(health|mana|currency) falls from (0|[1-9]\d*) to (0|[1-9]\d*)$"
)
CONSEQUENCE_LABELS = (
    "combat victory count",
    "combat defeat count",
    "combat stalemate count",
    "duel victory count",
    "duel defeat count",
    "duel draw count",
    "completion count",
    "completed dungeon count",
    "arrival count",
    "planned route count",
    "entered dungeon count",
    "task progress",
    "visited cell count",
    "foe health",
    "level",
    "experience",
    "ability experience",
    "town visit count",
    "active party count",
    "departure count",
    "health",
    "mana",
    "currency",
    "route distance",
)
CONSEQUENCE_PATTERN = re.compile(
    rf"^({'|'.join(re.escape(label) for label in CONSEQUENCE_LABELS)}) "
    r"(rises|falls) from (0|[1-9]\d*) to (0|[1-9]\d*)$"
)
ID_PATTERN = re.compile(
    r"^factual-story-beat-training-corpus-v2:holdout:\d{4}$"
)


def fail(message: str) -> None:
    raise ValueError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
    except OSError as error:
        fail(f"cannot read pinned evaluator core: {error}")
    return digest.hexdigest()


def verify_core(
    path: Path = CORE_PATH,
    expected_sha256: str = CORE_SHA256,
) -> None:
    if path.is_symlink() or not path.is_file():
        fail("pinned evaluator core must be a regular file")
    if sha256_file(path) != expected_sha256:
        fail("pinned evaluator core SHA-256 differs")


def load_core() -> ModuleType:
    verify_core()
    spec = importlib.util.spec_from_file_location(
        "_grind2_factual_story_beat_v2_evaluation_core",
        CORE_PATH,
    )
    if spec is None or spec.loader is None:
        fail("cannot load pinned evaluator core")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_core = load_core()
_core.SCHEMA_VERSION = SCHEMA_VERSION
_core.SEED = SEED
_core.HOLDOUT_CASE_COUNT = HOLDOUT_CASE_COUNT
_core.MAX_SOURCE_TOKENS = MAX_SOURCE_TOKENS
_core.MAX_NEW_TOKENS = MAX_NEW_TOKENS
_core.MAX_PROMPT_CHARACTERS = MAX_PROMPT_CHARACTERS
_core.MAX_TARGET_CHARACTERS = MAX_TARGET_CHARACTERS
_core.ID_PATTERN = ID_PATTERN

canonical = _core.canonical
canonical_hash = _core.canonical_hash
sha256_text = _core.sha256_text
stable_json_bytes = _core.stable_json_bytes
checked_path = _core.checked_path
load_json = _core.load_json
validate_holdout = _core.validate_holdout
load_holdout = _core.load_holdout
validate_model = _core.validate_model
validate_paths = _core.validate_paths
select_cases = _core.select_cases
model_evidence = _core.model_evidence
make_result_row = _core.make_result_row
build_evidence = _core.build_evidence
validate_evidence = _core.validate_evidence


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    )


def _parse_prompt_value(encoded: str, expected: Any, label: str) -> Any:
    try:
        value = json.loads(encoded)
    except json.JSONDecodeError as error:
        fail(f"factual V2 prompt {label} is invalid JSON: {error}")
    if not isinstance(value, expected) or isinstance(value, bool):
        fail(f"factual V2 prompt {label} has the wrong type")
    if _canonical_json(value) != encoded:
        fail(f"factual V2 prompt {label} must use canonical JSON")
    return value


def _validate_cost_clause(value: str) -> None:
    match = COST_PATTERN.fullmatch(value)
    if match is None:
        fail("factual V2 required cost clause is invalid")
    before, after = int(match.group(2)), int(match.group(3))
    if before > JS_SAFE_INTEGER or after > JS_SAFE_INTEGER or before <= after:
        fail("factual V2 required cost must fall")


def _validate_consequence_clause(value: str) -> None:
    match = CONSEQUENCE_PATTERN.fullmatch(value)
    if match is None:
        fail("factual V2 required consequence clause is invalid")
    direction = match.group(2)
    before, after = int(match.group(3)), int(match.group(4))
    if (
        before > JS_SAFE_INTEGER
        or after > JS_SAFE_INTEGER
        or (direction == "rises" and before >= after)
        or (direction == "falls" and before <= after)
    ):
        fail("factual V2 required consequence direction differs")


def factual_story_beat_facts_from_prompt(prompt: Any) -> dict[str, Any]:
    """Parse only the exact production factual-story-beat V2 prompt projection."""
    _core.bounded_text(
        prompt,
        "factual V2 prompt",
        MAX_PROMPT_CHARACTERS,
        allow_line_feed=True,
    )
    lines = prompt.split("\n")
    if (
        len(lines) != 9
        or lines[0] != PROMPT_INSTRUCTION
        or lines[-1] != "BEAT:"
    ):
        fail("factual V2 prompt does not match the production projection")
    facts: dict[str, Any] = {}
    for line, (prefix, field, expected) in zip(
        lines[1:8],
        PROMPT_LABELS,
        strict=True,
    ):
        if not line.startswith(prefix):
            fail(f"factual V2 prompt is missing exact {prefix.strip()} field")
        facts[field] = _parse_prompt_value(
            line[len(prefix):],
            expected,
            field,
        )
    for field, maximum in NARRATIVE_LIMITS.items():
        facts[field] = _core.bounded_text(
            facts[field],
            f"factual V2 prompt {field}",
            maximum,
            allow_line_feed=False,
        )
    if any(
        not facts[field].endswith((".", "!", "?"))
        for field in ("headline", "action", "consequence")
    ):
        fail("factual V2 narrative sentences must end in a sentence mark")
    if facts["lens"] not in LENSES:
        fail("factual V2 prompt lens is invalid")

    required_cost = facts["requiredCost"]
    required_consequence = facts["requiredConsequence"]
    if facts["lens"] == "cost" and (
        required_cost is None or required_consequence is not None
    ):
        fail("factual V2 cost lens clause presence differs")
    if facts["lens"] == "consequence" and (
        required_cost is not None or required_consequence is None
    ):
        fail("factual V2 consequence lens clause presence differs")
    if facts["lens"] == "contrast" and (
        required_cost is None or required_consequence is None
    ):
        fail("factual V2 contrast lens clause presence differs")
    if required_cost is not None:
        _core.bounded_text(
            required_cost,
            "factual V2 required cost",
            MAX_TARGET_CHARACTERS,
            allow_line_feed=False,
        )
        _validate_cost_clause(required_cost)
    if required_consequence is not None:
        _core.bounded_text(
            required_consequence,
            "factual V2 required consequence",
            MAX_TARGET_CHARACTERS,
            allow_line_feed=False,
        )
        _validate_consequence_clause(required_consequence)

    reconstructed = "\n".join((
        PROMPT_INSTRUCTION,
        *(f"{prefix}{_canonical_json(facts[field])}"
          for prefix, field, _expected in PROMPT_LABELS),
        "BEAT:",
    ))
    if reconstructed != prompt:
        fail("factual V2 prompt differs from its exact reconstruction")
    return facts


_base_validate_holdout = _core.validate_holdout


def validate_factual_holdout(value: Any) -> dict[str, Any]:
    checked = _base_validate_holdout(value)
    for case in checked["cases"]:
        factual_story_beat_facts_from_prompt(case["prompt"])
    return checked


_core.validate_holdout = validate_factual_holdout
validate_holdout = validate_factual_holdout


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
        "groundingConstraint": "none-unconstrained-pass-through-v2",
        "presentationSequence": "model-greedy-unforced-v2",
        "targetTokenization": "sealed-reference-never-tokenized-v2",
        "exactTopScoreTiePolicy": "transformers-greedy-default-v2",
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
        "padTokenId": _core.PAD_TOKEN_ID,
        "eosTokenId": EOS_TOKEN_ID,
    }


class UnconstrainedSetup(NamedTuple):
    tokenizer: Any
    label: str


class GeneratedTarget(NamedTuple):
    form_id: str
    text: str
    token_ids: tuple[int, ...]


def unconstrained_generation_setup(
    tokenizer: Any,
    facts: Mapping[str, Any],
    sequence_slot: int,
    label: str,
) -> tuple[UnconstrainedSetup, ...]:
    if not isinstance(facts, Mapping) or set(facts) != {
        "location",
        "headline",
        "action",
        "consequence",
        "lens",
        "requiredCost",
        "requiredConsequence",
    }:
        fail("factual V2 generation facts differ")
    if (
        isinstance(sequence_slot, bool)
        or not isinstance(sequence_slot, int)
        or sequence_slot < 0
    ):
        fail("factual V2 sequence slot is invalid")
    if tokenizer is None or not isinstance(label, str) or not label:
        fail("factual V2 unconstrained setup is invalid")
    return (UnconstrainedSetup(tokenizer=tokenizer, label=label),)


class UnconstrainedGreedyLogitsProcessor:
    """Observe decoder continuity while returning the complete logits unchanged."""

    def __init__(self, targets: tuple[UnconstrainedSetup, ...]) -> None:
        if len(targets) != 1:
            fail("factual V2 processor requires one unconstrained setup")
        self._setup = targets[0]
        self._previous_prefix: list[int] | None = None
        self._calls = 0
        self._finalized = False

    def __call__(self, input_ids: Any, scores: Any) -> Any:
        if self._finalized:
            fail("factual V2 generation is already finalized")
        decoder_ids = _core._one_sequence_ids(
            input_ids,
            "factual V2 decoder input",
        )
        if not decoder_ids or decoder_ids[0] != DECODER_START_TOKEN_ID:
            fail("factual V2 decoder input lacks its start token")
        prefix = decoder_ids[1:]
        if self._previous_prefix is None:
            if prefix:
                fail("factual V2 decoder prefix must begin at the root")
        elif (
            len(prefix) != len(self._previous_prefix) + 1
            or prefix[:-1] != self._previous_prefix
        ):
            fail("factual V2 decoder prefix is discontinuous")
        shape = getattr(scores, "shape", None)
        if shape is None or len(shape) != 2 or shape[0] != 1 or shape[1] < 2:
            fail("factual V2 logits must contain one vocabulary row")
        self._previous_prefix = list(prefix)
        self._calls += 1
        return scores

    def finalize(self, full_decoder_token_ids: Any) -> GeneratedTarget:
        if self._finalized:
            fail("factual V2 generation is already finalized")
        self._finalized = True
        full_sequence = _core._copy_flat_token_ids(
            full_decoder_token_ids,
            "factual V2 full decoder sequence",
        )
        if not full_sequence or full_sequence[0] != DECODER_START_TOKEN_ID:
            fail("factual V2 generated sequence lacks its start token")
        generated = full_sequence[1:]
        if not generated or len(generated) > MAX_NEW_TOKENS:
            fail("factual V2 generated token count is invalid")
        eos_indexes = [
            index for index, token_id in enumerate(generated)
            if token_id == EOS_TOKEN_ID
        ]
        if eos_indexes:
            if eos_indexes != [len(generated) - 1]:
                fail("factual V2 EOS placement is invalid")
        elif len(generated) != MAX_NEW_TOKENS:
            fail("factual V2 generation without EOS must fill the token budget")
        if self._calls != len(generated):
            fail("factual V2 processor call count differs from generated tokens")
        decoded = self._setup.tokenizer.decode(
            generated,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )
        if not isinstance(decoded, str):
            fail("factual V2 tokenizer did not decode one string")
        return GeneratedTarget(
            form_id="unconstrained-greedy-v2",
            text=decoded,
            token_ids=tuple(generated),
        )


_core.STORY_BEAT_PROMPT_INSTRUCTION = PROMPT_INSTRUCTION
_core.story_beat_facts_from_prompt = factual_story_beat_facts_from_prompt
_core.tokenize_story_beat_targets = unconstrained_generation_setup
_core.GroundedStoryBeatLogitsProcessor = UnconstrainedGreedyLogitsProcessor
_core.generation_contract = generation_contract


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
        help="fresh raw V2 evidence JSON file",
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
        help="validate closures and selection without importing ML packages",
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
            f"factual story-beat V2 heldout evaluation refused: {error}",
            file=sys.stderr,
        )
        raise SystemExit(2)
