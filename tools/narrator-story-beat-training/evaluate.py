#!/usr/bin/env python3
"""Generate hash-bound, developer-only evidence from the sealed story-beat holdout."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
import unicodedata
from collections.abc import Mapping
from pathlib import Path
from typing import Any, NamedTuple


SCHEMA_VERSION = 1
SEED = 20260904
CPU_THREADS = 4
CPU_INTEROP_THREADS = 1
HOLDOUT_CASE_COUNT = 200
MAX_SOURCE_TOKENS = 320
MAX_NEW_TOKENS = 48
CLEAN_UP_TOKENIZATION_SPACES = False
DECODER_START_TOKEN_ID = 0
PAD_TOKEN_ID = 0
EOS_TOKEN_ID = 1
MAX_PROMPT_CHARACTERS = 2400
MAX_TARGET_CHARACTERS = 160
MAX_EVIDENCE_OUTPUT_CHARACTERS = 4096
JS_SAFE_INTEGER = 9_007_199_254_740_991

CORPUS_KEYS = frozenset({"schemaVersion", "corpusHash", "cases"})
CASE_KEYS = frozenset({"id", "split", "prompt", "target", "caseHash"})
FILE_KEYS = frozenset({"path", "byteLength", "sha256"})
CONTRACT_KEYS = frozenset({
    "seed",
    "device",
    "dtype",
    "offline",
    "deterministicAlgorithms",
    "intraopThreads",
    "interopThreads",
    "maximumInputTokens",
    "maximumNewTokens",
    "doSample",
    "numBeams",
    "numReturnSequences",
    "cleanUpTokenizationSpaces",
    "groundingConstraint",
    "presentationSequence",
    "targetTokenization",
    "exactTopScoreTiePolicy",
    "returnDictInGenerate",
    "minLength",
    "minNewTokens",
    "repetitionPenalty",
    "noRepeatNgramSize",
    "encoderNoRepeatNgramSize",
    "badWordsIds",
    "forceWordsIds",
    "forcedBosTokenId",
    "forcedEosTokenId",
    "suppressTokens",
    "beginSuppressTokens",
    "guidanceScale",
    "decoderStartTokenId",
    "padTokenId",
    "eosTokenId",
})
MODEL_KEYS = frozenset({"path", "treeSha256", "files"})
HOLDOUT_KEYS = frozenset({
    "path",
    "schemaVersion",
    "corpusHash",
    "fileSha256",
    "caseCount",
})
SELECTION_KEYS = frozenset({
    "method",
    "requestedCaseCount",
    "selectedCaseCount",
    "selectedIdsHash",
})
ROW_KEYS = frozenset({
    "ordinal",
    "sourceOrdinal",
    "id",
    "caseHash",
    "selectionRankHash",
    "promptSha256",
    "referenceTargetSha256",
    "inputTokenCount",
    "generatedTokenCount",
    "output",
    "outputSha256",
    "elapsedMicroseconds",
    "rowHash",
})
SUMMARY_KEYS = frozenset({"rowCount", "totalElapsedMicroseconds"})
EVIDENCE_KEYS = frozenset({
    "schemaVersion",
    "kind",
    "disposition",
    "contract",
    "model",
    "holdout",
    "selection",
    "rows",
    "summary",
    "modelAdmitted",
    "displayAuthorized",
    "contentHash",
})

ID_PATTERN = re.compile(r"^story-beat-training-corpus-v1:holdout:\d{4}$")
HASH16_PATTERN = re.compile(r"^[0-9a-f]{16}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
STORY_BEAT_WORD_PATTERN = re.compile(
    r"[^\W_]+(?:['’\-][^\W_]+)*",
    re.UNICODE,
)

STORY_BEAT_PROMPT_INSTRUCTION = (
    "Write one sentence of at most 24 words. Name the place and use only facts "
    "and words supplied below. Do not add dialogue, thoughts, future events, "
    "quests, rewards, harm, or relationships."
)
STORY_BEAT_FACT_LIMITS = {
    "location": 120,
    "headline": 160,
    "action": 240,
    "consequence": 280,
}
STORY_BEAT_LOCATION_SHELLS = ("prefix", "interior", "suffix")
STORY_BEAT_PRESENTATION_JOINS = ("while", "as", "semicolon", "and")
STORY_BEAT_FRAME_DEFINITIONS = (
    ("action-while-consequence", "action", "while", "consequence"),
    ("consequence-while-action", "consequence", "while", "action"),
    ("headline-while-action", "headline", "while", "action"),
    ("action-as-headline", "action", "as", "headline"),
    ("headline-as-consequence", "headline", "as", "consequence"),
    ("consequence-as-headline", "consequence", "as", "headline"),
    ("action-semicolon-consequence", "action", "semicolon", "consequence"),
    ("consequence-semicolon-action", "consequence", "semicolon", "action"),
    ("headline-semicolon-action", "headline", "semicolon", "action"),
    ("action-semicolon-headline", "action", "semicolon", "headline"),
    ("headline-semicolon-consequence", "headline", "semicolon", "consequence"),
    ("consequence-semicolon-headline", "consequence", "semicolon", "headline"),
    ("action-and-consequence", "action", "and", "consequence"),
    ("headline-and-action", "headline", "and", "action"),
    ("headline-and-consequence", "headline", "and", "consequence"),
)


class StoryBeatForm(NamedTuple):
    form_id: str
    location_shell: str
    frame_id: str
    first: str
    join: str
    second: str
    text: str


class StoryBeatFormEligibility(NamedTuple):
    schema_version: int
    sequence_slot: int
    requested_bucket_id: str
    selected_bucket_id: str | None
    forms: tuple[StoryBeatForm, ...]


class StoryBeatTokenTarget(NamedTuple):
    form_id: str
    text: str
    token_ids: tuple[int, ...]


def fail(message: str) -> None:
    raise ValueError(message)


def exact_keys(value: dict[str, Any], expected: frozenset[str], label: str) -> None:
    if set(value) != expected:
        differing = sorted(repr(key) for key in set(value) ^ expected)
        fail(f"{label} keys differ: {differing}")


def canonical(value: Any) -> str:
    """Match src/core/canonical.ts and export-corpus.mjs exactly."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > JS_SAFE_INTEGER:
            fail("canonical number is outside JavaScript safe-integer range")
        return str(value)
    if isinstance(value, list):
        return "[" + ",".join(canonical(item) for item in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            fail("canonical object keys must be strings")
        return "{" + ",".join(
            f"{json.dumps(key, ensure_ascii=False)}:{canonical(value[key])}"
            for key in sorted(value)
        ) + "}"
    fail(f"unsupported canonical value: {type(value).__name__}")


def canonical_hash(value: Any) -> str:
    left = 0x811C9DC5
    right = 0x9E3779B9
    source = canonical(value).encode("utf-16-le", "surrogatepass")
    for index in range(0, len(source), 2):
        code = source[index] | (source[index + 1] << 8)
        left = ((left ^ code) * 0x01000193) & 0xFFFFFFFF
        right ^= (
            code
            + 0x9E3779B9
            + ((right << 6) & 0xFFFFFFFF)
            + (right >> 2)
        ) & 0xFFFFFFFF
        right &= 0xFFFFFFFF
    return f"{left:08x}{right:08x}"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_text(value: str) -> str:
    return sha256_bytes(value.encode("utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stable_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _reject_duplicate_object_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            fail(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json(path: Path, label: str) -> Any:
    try:
        raw = path.read_bytes()
    except OSError as error:
        fail(f"cannot read {label}: {error}")
    try:
        return json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_object_keys,
            parse_constant=lambda token: fail(f"non-finite JSON number: {token}"),
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"invalid {label} JSON: {error}")


def utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le", "surrogatepass")) // 2


def _has_unsafe_unicode(value: str, allow_line_feed: bool) -> bool:
    for scalar in value:
        category = unicodedata.category(scalar)
        if category in {"Cf", "Cs", "Zl", "Zp"}:
            return True
        if category == "Cc" and not (allow_line_feed and scalar == "\n"):
            return True
    return False


def bounded_text(
    value: Any,
    label: str,
    maximum: int,
    *,
    allow_line_feed: bool,
) -> str:
    if not isinstance(value, str):
        fail(f"{label} must be text")
    if not value or utf16_length(value) > maximum:
        fail(f"{label} must contain 1..{maximum} characters")
    if value != value.strip() or value != unicodedata.normalize("NFC", value):
        fail(f"{label} must be trimmed NFC text")
    if _has_unsafe_unicode(value, allow_line_feed):
        fail(f"{label} contains unsafe Unicode")
    if not any(scalar.isalnum() for scalar in value):
        fail(f"{label} must contain a letter or number")
    return value


def _json_string(value: str) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    )


def story_beat_facts_from_prompt(prompt: Any) -> dict[str, str]:
    """Parse only the exact production story-beat prompt projection."""
    bounded_text(
        prompt,
        "story-beat prompt",
        MAX_PROMPT_CHARACTERS,
        allow_line_feed=True,
    )
    lines = prompt.split("\n")
    labels = (
        ("PLACE: ", "location"),
        ("HEADLINE: ", "headline"),
        ("ACTION: ", "action"),
        ("CONSEQUENCE: ", "consequence"),
    )
    if len(lines) != 6 or lines[0] != STORY_BEAT_PROMPT_INSTRUCTION or lines[-1] != "BEAT:":
        fail("story-beat prompt does not match the production projection")
    facts: dict[str, str] = {}
    for line, (label, field) in zip(lines[1:5], labels, strict=True):
        if not line.startswith(label):
            fail(f"story-beat prompt is missing exact {label.strip()} field")
        encoded = line[len(label):]
        try:
            value = json.loads(encoded)
        except json.JSONDecodeError as error:
            fail(f"story-beat prompt {field} is invalid JSON: {error}")
        if not isinstance(value, str) or _json_string(value) != encoded:
            fail(f"story-beat prompt {field} must be a canonical JSON string")
        facts[field] = bounded_text(
            value,
            f"story-beat prompt {field}",
            STORY_BEAT_FACT_LIMITS[field],
            allow_line_feed=False,
        )
    if any(not facts[field].endswith((".", "!", "?")) for field in (
        "headline",
        "action",
        "consequence",
    )):
        fail("story-beat source sentences must end in a sentence mark")
    reconstructed = "\n".join((
        STORY_BEAT_PROMPT_INSTRUCTION,
        f"PLACE: {_json_string(facts['location'])}",
        f"HEADLINE: {_json_string(facts['headline'])}",
        f"ACTION: {_json_string(facts['action'])}",
        f"CONSEQUENCE: {_json_string(facts['consequence'])}",
        "BEAT:",
    ))
    if reconstructed != prompt:
        fail("story-beat prompt differs from its exact production reconstruction")
    return facts


def _lower_initial(value: str) -> str:
    return value[0].lower() + value[1:]


def _join_story_beat_fragments(first: str, join: str, second: str) -> str:
    if join == "semicolon":
        return f"{first}; {second}"
    if join == "and":
        return f"{first} and {second}"
    return f"{first}, {join} {second}"


def _render_story_beat_form(
    location: str,
    shell: str,
    first: str,
    join: str,
    second: str,
) -> str:
    if shell == "prefix":
        return f"At {location}, {_join_story_beat_fragments(first, join, second)}."
    if shell == "suffix":
        return f"{_join_story_beat_fragments(first, join, second)} at {location}."
    if join == "semicolon":
        joined = f"{first} at {location}; {second}"
    elif join == "and":
        joined = f"{first} at {location} and {second}"
    else:
        joined = f"{first} at {location}, {join} {second}"
    return f"{joined}."


def _valid_story_beat_form(value: str, location: str) -> bool:
    return (
        0 < utf16_length(value) <= MAX_TARGET_CHARACTERS
        and value == value.strip()
        and value == unicodedata.normalize("NFC", value)
        and not _has_unsafe_unicode(value, allow_line_feed=False)
        and "\n" not in value
        and "  " not in value
        and location in value
        and len(STORY_BEAT_WORD_PATTERN.findall(value)) <= 24
    )


def story_beat_forms(facts: Mapping[str, str]) -> tuple[StoryBeatForm, ...]:
    if set(facts) != set(STORY_BEAT_FACT_LIMITS):
        fail("story-beat form facts have unexpected fields")
    checked = {
        field: bounded_text(
            facts[field],
            f"story-beat form {field}",
            maximum,
            allow_line_feed=False,
        )
        for field, maximum in STORY_BEAT_FACT_LIMITS.items()
    }
    fragments: dict[str, tuple[str, str]] = {}
    for field in ("headline", "action", "consequence"):
        source = checked[field]
        if len(source) <= 1 or source[-1] not in ".!?":
            fail(f"story-beat form {field} lacks a terminal sentence mark")
        without_terminal = source[:-1]
        fragments[field] = (
            without_terminal,
            _lower_initial(without_terminal) if field != "action" else without_terminal,
        )

    forms: list[StoryBeatForm] = []
    seen_text: set[str] = set()
    for frame_id, first, join, second in STORY_BEAT_FRAME_DEFINITIONS:
        for shell in STORY_BEAT_LOCATION_SHELLS:
            text = _render_story_beat_form(
                checked["location"],
                shell,
                fragments[first][1] if shell == "prefix" else fragments[first][0],
                join,
                fragments[second][1],
            )
            if text in seen_text or not _valid_story_beat_form(text, checked["location"]):
                continue
            seen_text.add(text)
            forms.append(StoryBeatForm(
                form_id=f"{shell}-{frame_id}",
                location_shell=shell,
                frame_id=frame_id,
                first=first,
                join=join,
                second=second,
                text=text,
            ))
    return tuple(forms)


def select_story_beat_form_eligibility(
    facts: Mapping[str, str],
    sequence_slot: int,
) -> StoryBeatFormEligibility:
    if isinstance(sequence_slot, bool) or not isinstance(sequence_slot, int) or sequence_slot < 0:
        fail("story-beat presentation sequence slot is invalid")
    forms = story_beat_forms(facts)
    buckets = tuple(
        (f"{shell}-{join}", shell, join)
        for join in STORY_BEAT_PRESENTATION_JOINS
        for shell in STORY_BEAT_LOCATION_SHELLS
    )
    requested_index = sequence_slot % len(buckets)
    requested_id = buckets[requested_index][0]
    for offset in range(len(buckets)):
        bucket_id, shell, join = buckets[(requested_index + offset) % len(buckets)]
        eligible = tuple(
            form for form in forms
            if form.location_shell == shell and form.join == join
        )
        if eligible:
            return StoryBeatFormEligibility(
                schema_version=1,
                sequence_slot=sequence_slot,
                requested_bucket_id=requested_id,
                selected_bucket_id=bucket_id,
                forms=eligible,
            )
    return StoryBeatFormEligibility(
        schema_version=1,
        sequence_slot=sequence_slot,
        requested_bucket_id=requested_id,
        selected_bucket_id=None,
        forms=(),
    )


def case_payload(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": case["id"],
        "split": case["split"],
        "prompt": case["prompt"],
        "target": case["target"],
    }


def corpus_payload(corpus: dict[str, Any]) -> dict[str, Any]:
    return {"schemaVersion": corpus["schemaVersion"], "cases": corpus["cases"]}


def validate_holdout_case(value: Any, index: int) -> dict[str, Any]:
    label = f"cases[{index}]"
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    exact_keys(value, CASE_KEYS, label)
    if not isinstance(value["id"], str) or not ID_PATTERN.fullmatch(value["id"]):
        fail(f"{label}.id is invalid")
    if value["split"] != "holdout":
        fail(f"{label}.split must be holdout; train/dev rows are forbidden")
    bounded_text(
        value["prompt"],
        f"{label}.prompt",
        MAX_PROMPT_CHARACTERS,
        allow_line_feed=True,
    )
    bounded_text(
        value["target"],
        f"{label}.target",
        MAX_TARGET_CHARACTERS,
        allow_line_feed=False,
    )
    if not isinstance(value["caseHash"], str) or not HASH16_PATTERN.fullmatch(value["caseHash"]):
        fail(f"{label}.caseHash is invalid")
    if value["caseHash"] != canonical_hash(case_payload(value)):
        fail(f"{label}.caseHash differs from canonical payload")
    return value


def validate_holdout(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail("holdout must be an object")
    exact_keys(value, CORPUS_KEYS, "holdout")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != SCHEMA_VERSION:
        fail("unsupported holdout schema version")
    if not isinstance(value["cases"], list) or len(value["cases"]) != HOLDOUT_CASE_COUNT:
        fail(f"holdout must contain exactly {HOLDOUT_CASE_COUNT} cases")
    cases = [
        validate_holdout_case(case, index)
        for index, case in enumerate(value["cases"])
    ]
    if not isinstance(value["corpusHash"], str) or not HASH16_PATTERN.fullmatch(value["corpusHash"]):
        fail("holdout.corpusHash is invalid")
    if value["corpusHash"] != canonical_hash(corpus_payload(value)):
        fail("holdout.corpusHash differs from canonical payload")
    for label, values in (
        ("ids", [case["id"] for case in cases]),
        ("case hashes", [case["caseHash"] for case in cases]),
        ("prompts", [case["prompt"] for case in cases]),
    ):
        if len(values) != len(set(values)):
            fail(f"holdout contains duplicate {label}")
    return value


def _raw_path_is_safe(raw: str, label: str) -> None:
    if not raw or "\x00" in raw or "\\" in raw:
        fail(f"{label} path is unsafe")
    path = Path(raw)
    if any(part in {"", ".", "..", "~"} for part in path.parts[1:] if path.is_absolute()):
        fail(f"{label} path traversal is forbidden")
    if any(part in {".", "..", "~"} for part in path.parts if not path.is_absolute()):
        fail(f"{label} path traversal is forbidden")


def checked_path(raw: str, label: str) -> Path:
    _raw_path_is_safe(raw, label)
    path = Path(raw)
    absolute = path if path.is_absolute() else Path.cwd() / path
    absolute = Path(os.path.abspath(absolute))
    for candidate in [absolute, *absolute.parents]:
        if candidate.exists() and candidate.is_symlink():
            fail(f"{label} path contains a symlink: {candidate}")
    return absolute


def require_regular_file(path: Path, label: str) -> None:
    if path.is_symlink() or not path.is_file():
        fail(f"{label} must be a regular file")


def regular_file_manifest(root: Path) -> list[dict[str, Any]]:
    if root.is_symlink() or not root.is_dir():
        fail(f"not a regular directory: {root}")
    result: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            fail(f"symlink is forbidden: {path}")
        if path.is_dir():
            continue
        if path.is_file():
            result.append({
                "path": path.relative_to(root).as_posix(),
                "byteLength": path.stat().st_size,
                "sha256": sha256_file(path),
            })
            continue
        fail(f"non-regular model entry is forbidden: {path}")
    return result


def validate_model(model: Path) -> list[dict[str, Any]]:
    if model.is_symlink() or not model.is_dir():
        fail("model must be a local regular directory")
    manifest = regular_file_manifest(model)
    paths = {item["path"] for item in manifest}
    if "config.json" not in paths:
        fail("model is missing config.json")
    if not ({"tokenizer.json", "spiece.model"} & paths):
        fail("model is missing tokenizer material")
    if any(path.endswith((".bin", ".pt", ".pth")) for path in paths):
        fail("pickle model weights are forbidden; safetensors is required")
    if not any(path.endswith(".safetensors") for path in paths):
        fail("model is missing local safetensors weights")
    return manifest


def validate_fresh_output(output: Path) -> None:
    if output.exists() or output.is_symlink():
        fail("evaluation output must be a fresh JSON file")
    if output.suffix != ".json":
        fail("evaluation output must use a .json suffix")
    parent = output.parent
    if parent.is_symlink() or not parent.is_dir():
        fail("evaluation output parent must be an existing regular directory")
    if output == Path(output.anchor):
        fail("evaluation output cannot be a filesystem root")


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def validate_paths(holdout_path: Path, model: Path, output: Path) -> None:
    require_regular_file(holdout_path, "holdout")
    validate_fresh_output(output)
    if _is_within(output, model):
        fail("evaluation output cannot be inside the immutable model")
    if output == holdout_path or _is_within(holdout_path, output):
        fail("evaluation output overlaps the holdout")


def load_holdout(path: Path) -> dict[str, Any]:
    require_regular_file(path, "holdout")
    return validate_holdout(load_json(path, "holdout"))


def generation_contract() -> dict[str, Any]:
    return {
        "seed": SEED,
        "device": "cpu",
        "dtype": "float32",
        "offline": True,
        "deterministicAlgorithms": True,
        "intraopThreads": CPU_THREADS,
        "interopThreads": CPU_INTEROP_THREADS,
        "maximumInputTokens": MAX_SOURCE_TOKENS,
        "maximumNewTokens": MAX_NEW_TOKENS,
        "doSample": False,
        "numBeams": 1,
        "numReturnSequences": 1,
        "cleanUpTokenizationSpaces": CLEAN_UP_TOKENIZATION_SPACES,
        "groundingConstraint": "eligible-form-token-trie-v1",
        "presentationSequence": "location-shell-join-12-slot-v1",
        "targetTokenization": "special-tokens-exact-roundtrip-v1",
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


def selection_rank(case: dict[str, Any]) -> str:
    return canonical_hash({
        "schemaVersion": SCHEMA_VERSION,
        "purpose": "story-beat-heldout-selection-v1",
        "seed": SEED,
        "id": case["id"],
        "caseHash": case["caseHash"],
    })


def select_cases(
    holdout: dict[str, Any],
    requested_case_count: int,
) -> tuple[list[tuple[int, dict[str, Any], str]], dict[str, Any]]:
    if (
        isinstance(requested_case_count, bool)
        or not isinstance(requested_case_count, int)
        or requested_case_count < 1
        or requested_case_count > HOLDOUT_CASE_COUNT
    ):
        fail(f"case count must be within 1..{HOLDOUT_CASE_COUNT}")
    ranked = sorted(
        (
            (source_ordinal, case, selection_rank(case))
            for source_ordinal, case in enumerate(holdout["cases"])
        ),
        key=lambda entry: (entry[2], entry[1]["id"]),
    )
    selected = ranked[:requested_case_count]
    selection = {
        "method": "canonical-rank-v1",
        "requestedCaseCount": requested_case_count,
        "selectedCaseCount": len(selected),
        "selectedIdsHash": canonical_hash([entry[1]["id"] for entry in selected]),
    }
    return selected, selection


def model_evidence(model: Path, files: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "path": str(model),
        "treeSha256": sha256_bytes(stable_json_bytes(files)),
        "files": files,
    }


def holdout_evidence(path: Path, holdout: dict[str, Any]) -> dict[str, Any]:
    return {
        "path": str(path),
        "schemaVersion": holdout["schemaVersion"],
        "corpusHash": holdout["corpusHash"],
        "fileSha256": sha256_file(path),
        "caseCount": len(holdout["cases"]),
    }


def make_result_row(
    *,
    ordinal: int,
    source_ordinal: int,
    case: dict[str, Any],
    rank_hash: str,
    input_token_count: int,
    generated_token_count: int,
    output: str,
    elapsed_microseconds: int,
) -> dict[str, Any]:
    payload = {
        "ordinal": ordinal,
        "sourceOrdinal": source_ordinal,
        "id": case["id"],
        "caseHash": case["caseHash"],
        "selectionRankHash": rank_hash,
        "promptSha256": sha256_text(case["prompt"]),
        "referenceTargetSha256": sha256_text(case["target"]),
        "inputTokenCount": input_token_count,
        "generatedTokenCount": generated_token_count,
        "output": output,
        "outputSha256": sha256_text(output),
        "elapsedMicroseconds": elapsed_microseconds,
    }
    return {**payload, "rowHash": canonical_hash(payload)}


def evidence_payload(evidence: dict[str, Any]) -> dict[str, Any]:
    return {key: evidence[key] for key in evidence if key != "contentHash"}


def build_evidence(
    *,
    model: Path,
    model_files: list[dict[str, Any]],
    holdout_path: Path,
    holdout: dict[str, Any],
    selection: dict[str, Any],
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "story-beat-heldout-generation",
        "disposition": "developer-evidence-not-runtime-admitted",
        "contract": generation_contract(),
        "model": model_evidence(model, model_files),
        "holdout": holdout_evidence(holdout_path, holdout),
        "selection": selection,
        "rows": rows,
        "summary": {
            "rowCount": len(rows),
            "totalElapsedMicroseconds": sum(row["elapsedMicroseconds"] for row in rows),
        },
        "modelAdmitted": False,
        "displayAuthorized": False,
    }
    return {**payload, "contentHash": canonical_hash(payload)}


def _valid_file_entry(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and set(value) == FILE_KEYS
        and isinstance(value["path"], str)
        and bool(value["path"])
        and not value["path"].startswith("/")
        and "\\" not in value["path"]
        and all(part not in {"", ".", ".."} for part in Path(value["path"]).parts)
        and type(value["byteLength"]) is int
        and 0 <= value["byteLength"] <= JS_SAFE_INTEGER
        and isinstance(value["sha256"], str)
        and SHA256_PATTERN.fullmatch(value["sha256"]) is not None
    )


def _safe_integer(value: Any, minimum: int, maximum: int, label: str) -> int:
    if type(value) is not int or value < minimum or value > maximum:
        fail(f"{label} must be a safe integer within {minimum}..{maximum}")
    return value


def _validate_evidence_output(value: Any, label: str) -> str:
    if not isinstance(value, str):
        fail(f"{label} must be one string")
    if utf16_length(value) > MAX_EVIDENCE_OUTPUT_CHARACTERS:
        fail(f"{label} exceeds the evidence character ceiling")
    if value != unicodedata.normalize("NFC", value):
        fail(f"{label} must be NFC text")
    if any(unicodedata.category(scalar) == "Cs" for scalar in value):
        fail(f"{label} contains a surrogate")
    return value


def validate_evidence(
    value: Any,
    *,
    model: Path | None = None,
    model_files: list[dict[str, Any]] | None = None,
    holdout_path: Path | None = None,
    holdout: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail("evaluation evidence must be an object")
    exact_keys(value, EVIDENCE_KEYS, "evaluation evidence")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != SCHEMA_VERSION:
        fail("unsupported evaluation evidence schema version")
    if value["kind"] != "story-beat-heldout-generation":
        fail("evaluation evidence kind differs")
    if value["disposition"] != "developer-evidence-not-runtime-admitted":
        fail("evaluation evidence disposition differs")
    if value["modelAdmitted"] is not False or value["displayAuthorized"] is not False:
        fail("evaluation evidence cannot admit a model or authorize display")
    if not isinstance(value["contentHash"], str) or not HASH16_PATTERN.fullmatch(value["contentHash"]):
        fail("evaluation evidence content hash is invalid")
    if value["contentHash"] != canonical_hash(evidence_payload(value)):
        fail("evaluation evidence content hash differs")

    contract = value["contract"]
    if not isinstance(contract, dict):
        fail("evaluation evidence contract must be an object")
    exact_keys(contract, CONTRACT_KEYS, "evaluation evidence contract")
    if contract != generation_contract():
        fail("evaluation evidence generation contract differs")

    model_value = value["model"]
    if not isinstance(model_value, dict):
        fail("evaluation evidence model must be an object")
    exact_keys(model_value, MODEL_KEYS, "evaluation evidence model")
    if not isinstance(model_value["path"], str) or not model_value["path"]:
        fail("evaluation evidence model path is invalid")
    if not isinstance(model_value["treeSha256"], str) or not SHA256_PATTERN.fullmatch(model_value["treeSha256"]):
        fail("evaluation evidence model tree hash is invalid")
    files = model_value["files"]
    if not isinstance(files, list) or not files or not all(_valid_file_entry(item) for item in files):
        fail("evaluation evidence model files are invalid")
    if files != sorted(files, key=lambda item: item["path"]):
        fail("evaluation evidence model files must be sorted")
    if len({item["path"] for item in files}) != len(files):
        fail("evaluation evidence model files contain duplicates")
    if model_value["treeSha256"] != sha256_bytes(stable_json_bytes(files)):
        fail("evaluation evidence model tree hash differs")
    if model is not None and model_value["path"] != str(model):
        fail("evaluation evidence model path differs")
    if model_files is not None and files != model_files:
        fail("evaluation evidence model closure differs")

    holdout_value = value["holdout"]
    if not isinstance(holdout_value, dict):
        fail("evaluation evidence holdout must be an object")
    exact_keys(holdout_value, HOLDOUT_KEYS, "evaluation evidence holdout")
    if not isinstance(holdout_value["path"], str) or not holdout_value["path"]:
        fail("evaluation evidence holdout path is invalid")
    if (
        type(holdout_value["schemaVersion"]) is not int
        or holdout_value["schemaVersion"] != SCHEMA_VERSION
        or not isinstance(holdout_value["corpusHash"], str)
        or not HASH16_PATTERN.fullmatch(holdout_value["corpusHash"])
        or not isinstance(holdout_value["fileSha256"], str)
        or not SHA256_PATTERN.fullmatch(holdout_value["fileSha256"])
        or holdout_value["caseCount"] != HOLDOUT_CASE_COUNT
    ):
        fail("evaluation evidence holdout binding is invalid")
    if holdout_path is not None and holdout_value["path"] != str(holdout_path):
        fail("evaluation evidence holdout path differs")
    if holdout is not None:
        expected_holdout = holdout_evidence(holdout_path, holdout) if holdout_path is not None else None
        if expected_holdout is not None and holdout_value != expected_holdout:
            fail("evaluation evidence holdout closure differs")

    selection_value = value["selection"]
    if not isinstance(selection_value, dict):
        fail("evaluation evidence selection must be an object")
    exact_keys(selection_value, SELECTION_KEYS, "evaluation evidence selection")
    if selection_value["method"] != "canonical-rank-v1":
        fail("evaluation evidence selection method differs")
    requested_count = _safe_integer(
        selection_value["requestedCaseCount"],
        1,
        HOLDOUT_CASE_COUNT,
        "selection.requestedCaseCount",
    )
    if selection_value["selectedCaseCount"] != requested_count:
        fail("evaluation evidence selected case count differs")
    if not isinstance(selection_value["selectedIdsHash"], str) or not HASH16_PATTERN.fullmatch(
        selection_value["selectedIdsHash"]
    ):
        fail("evaluation evidence selected ids hash is invalid")

    rows = value["rows"]
    if not isinstance(rows, list) or len(rows) != requested_count:
        fail("evaluation evidence rows differ from the selection count")
    expected_selected = None
    if holdout is not None:
        expected_selected, expected_selection = select_cases(holdout, requested_count)
        if selection_value != expected_selection:
            fail("evaluation evidence deterministic selection differs")
    ids: list[str] = []
    row_hashes: list[str] = []
    total_elapsed = 0
    for index, row in enumerate(rows):
        label = f"evaluation evidence rows[{index}]"
        if not isinstance(row, dict):
            fail(f"{label} must be an object")
        exact_keys(row, ROW_KEYS, label)
        _safe_integer(row["ordinal"], index, index, f"{label}.ordinal")
        _safe_integer(row["sourceOrdinal"], 0, HOLDOUT_CASE_COUNT - 1, f"{label}.sourceOrdinal")
        if not isinstance(row["id"], str) or not ID_PATTERN.fullmatch(row["id"]):
            fail(f"{label}.id is invalid")
        for field in ("caseHash", "selectionRankHash", "rowHash"):
            if not isinstance(row[field], str) or not HASH16_PATTERN.fullmatch(row[field]):
                fail(f"{label}.{field} is invalid")
        for field in ("promptSha256", "referenceTargetSha256", "outputSha256"):
            if not isinstance(row[field], str) or not SHA256_PATTERN.fullmatch(row[field]):
                fail(f"{label}.{field} is invalid")
        _safe_integer(row["inputTokenCount"], 1, MAX_SOURCE_TOKENS, f"{label}.inputTokenCount")
        _safe_integer(row["generatedTokenCount"], 0, MAX_NEW_TOKENS, f"{label}.generatedTokenCount")
        output = _validate_evidence_output(row["output"], f"{label}.output")
        _safe_integer(
            row["elapsedMicroseconds"],
            0,
            JS_SAFE_INTEGER,
            f"{label}.elapsedMicroseconds",
        )
        if row["outputSha256"] != sha256_text(output):
            fail(f"{label}.outputSha256 differs")
        row_payload = {key: row[key] for key in row if key != "rowHash"}
        if row["rowHash"] != canonical_hash(row_payload):
            fail(f"{label}.rowHash differs")
        if expected_selected is not None:
            source_ordinal, case, rank_hash = expected_selected[index]
            expected = {
                "sourceOrdinal": source_ordinal,
                "id": case["id"],
                "caseHash": case["caseHash"],
                "selectionRankHash": rank_hash,
                "promptSha256": sha256_text(case["prompt"]),
                "referenceTargetSha256": sha256_text(case["target"]),
            }
            if any(row[field] != expected[field] for field in expected):
                fail(f"{label} differs from the sealed deterministic selection")
        ids.append(row["id"])
        row_hashes.append(row["rowHash"])
        total_elapsed += row["elapsedMicroseconds"]
    if len(ids) != len(set(ids)) or len(row_hashes) != len(set(row_hashes)):
        fail("evaluation evidence rows contain duplicates")
    if selection_value["selectedIdsHash"] != canonical_hash(ids):
        fail("evaluation evidence selected ids hash differs")

    summary = value["summary"]
    if not isinstance(summary, dict):
        fail("evaluation evidence summary must be an object")
    exact_keys(summary, SUMMARY_KEYS, "evaluation evidence summary")
    if summary["rowCount"] != len(rows):
        fail("evaluation evidence summary row count differs")
    _safe_integer(
        summary["totalElapsedMicroseconds"],
        0,
        JS_SAFE_INTEGER,
        "summary.totalElapsedMicroseconds",
    )
    if summary["totalElapsedMicroseconds"] != total_elapsed:
        fail("evaluation evidence total timing differs")
    return value


def enforce_offline_environment() -> None:
    if os.environ.get("PYTHONHASHSEED") != str(SEED):
        fail(f"PYTHONHASHSEED must be {SEED} before Python starts")
    os.environ.update({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "HF_DATASETS_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "TOKENIZERS_PARALLELISM": "false",
        "WANDB_DISABLED": "true",
    })


def _token_count(encoded: Any, label: str) -> int:
    if not isinstance(encoded, Mapping) or "input_ids" not in encoded:
        fail(f"{label} tokenizer result is invalid")
    input_ids = encoded["input_ids"]
    shape = getattr(input_ids, "shape", None)
    if shape is None or len(shape) != 2 or shape[0] != 1:
        fail(f"{label} tokenizer result must contain exactly one sequence")
    count = int(shape[1])
    if count < 1 or count > MAX_SOURCE_TOKENS:
        fail(f"{label} has {count} input tokens; maximum is {MAX_SOURCE_TOKENS}")
    return count


def _one_sequence_ids(sequences: Any, label: str) -> list[int]:
    shape = getattr(sequences, "shape", None)
    if shape is None or len(shape) != 2 or shape[0] != 1:
        fail(f"{label} must contain exactly one token sequence")
    sequence = sequences[0]
    if hasattr(sequence, "detach"):
        sequence = sequence.detach()
    if hasattr(sequence, "cpu"):
        sequence = sequence.cpu()
    if hasattr(sequence, "tolist"):
        sequence = sequence.tolist()
    if (
        not isinstance(sequence, list)
        or any(isinstance(token, bool) or not isinstance(token, int) for token in sequence)
    ):
        fail(f"{label} contains invalid token ids")
    return sequence


def _sequence_ids(sequences: Any, label: str) -> list[int]:
    return _one_sequence_ids(sequences, f"{label} generation")


def tokenize_story_beat_targets(
    tokenizer: Any,
    facts: Mapping[str, str],
    sequence_slot: int,
    label: str,
) -> tuple[StoryBeatTokenTarget, ...]:
    eligibility = select_story_beat_form_eligibility(facts, sequence_slot)
    targets: list[StoryBeatTokenTarget] = []
    for form in eligibility.forms:
        encoded = tokenizer(
            form.text,
            add_special_tokens=True,
            padding=False,
            truncation=False,
            return_tensors="pt",
        )
        if not isinstance(encoded, Mapping) or "input_ids" not in encoded:
            fail(f"{label} target tokenizer result is invalid")
        token_ids = _one_sequence_ids(
            encoded["input_ids"],
            f"{label} target {form.form_id}",
        )
        if len(token_ids) > MAX_NEW_TOKENS:
            continue
        if (
            not token_ids
            or PAD_TOKEN_ID in token_ids
            or token_ids[-1] != EOS_TOKEN_ID
            or EOS_TOKEN_ID in token_ids[:-1]
        ):
            fail(f"{label} target {form.form_id} has invalid special-token placement")
        decoded = tokenizer.decode(
            token_ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=CLEAN_UP_TOKENIZATION_SPACES,
        )
        if not isinstance(decoded, str) or decoded != form.text:
            fail(f"{label} target {form.form_id} failed exact tokenizer round-trip")
        targets.append(StoryBeatTokenTarget(
            form_id=form.form_id,
            text=form.text,
            token_ids=tuple(token_ids),
        ))
    if not targets:
        fail(f"{label} has no tokenizable eligible grounded forms")
    token_paths = [target.token_ids for target in targets]
    if len(token_paths) != len(set(token_paths)):
        fail(f"{label} eligible grounded forms have duplicate token paths")
    return tuple(targets)


def _copy_flat_token_ids(value: Any, label: str) -> list[int]:
    if hasattr(value, "detach"):
        value = value.detach()
    if hasattr(value, "cpu"):
        value = value.cpu()
    if hasattr(value, "tolist"):
        value = value.tolist()
    if (
        not isinstance(value, list)
        or any(isinstance(token, bool) or not isinstance(token, int) for token in value)
        or len(value) > MAX_NEW_TOKENS + 1
    ):
        fail(f"{label} contains invalid token ids")
    return value


def _allowed_story_beat_token_ids(
    targets: tuple[StoryBeatTokenTarget, ...],
    prefix: list[int],
) -> list[int]:
    matching = [
        target for target in targets
        if len(prefix) < len(target.token_ids)
        and list(target.token_ids[:len(prefix)]) == prefix
    ]
    if not matching:
        fail("story-beat trie prefix does not match an incomplete grounded form")
    return sorted({target.token_ids[len(prefix)] for target in matching})


class GroundedStoryBeatLogitsProcessor:
    def __init__(self, targets: tuple[StoryBeatTokenTarget, ...]) -> None:
        if not targets:
            fail("story-beat logits processor requires grounded targets")
        self._targets = targets
        _allowed_story_beat_token_ids(targets, [])
        self._previous_prefix: list[int] | None = None
        self._previous_expected_token_id: int | None = None
        self._expected_generated_token_ids: list[int] = []
        self._finalized = False

    def __call__(self, input_ids: Any, scores: Any) -> Any:
        if self._finalized:
            fail("story-beat form selection is already finalized")
        decoder_ids = _one_sequence_ids(input_ids, "story-beat decoder input")
        if not decoder_ids or decoder_ids[0] != DECODER_START_TOKEN_ID:
            fail("story-beat decoder input is missing its decoder-start token")
        prefix = decoder_ids[1:]
        if self._previous_prefix is None:
            if prefix:
                fail("story-beat decoder prefix must begin at the trie root")
        else:
            if (
                len(prefix) != len(self._previous_prefix) + 1
                or prefix[:-1] != self._previous_prefix
                or prefix[-1] != self._previous_expected_token_id
            ):
                fail("story-beat decoder did not emit the unique maximum trie token")

        shape = getattr(scores, "shape", None)
        if shape is None or len(shape) != 2 or shape[0] != 1:
            fail("story-beat logits must contain exactly one vocabulary row")
        vocabulary_size = int(shape[1])
        allowed = _allowed_story_beat_token_ids(self._targets, prefix)
        if any(token_id < 0 or token_id >= vocabulary_size for token_id in allowed):
            fail("story-beat allowed token is outside the logits vocabulary")
        allowed_scores: list[float] = []
        for token_id in allowed:
            score = scores[0, token_id]
            if hasattr(score, "item"):
                score = score.item()
            try:
                numeric_score = float(score)
            except (TypeError, ValueError, OverflowError):
                fail("story-beat allowed token score is not numeric")
            if not math.isfinite(numeric_score):
                fail("story-beat allowed token scores must be finite")
            allowed_scores.append(numeric_score)
        maximum = max(allowed_scores)
        maximum_indexes = [
            index for index, score in enumerate(allowed_scores)
            if score == maximum
        ]
        if len(maximum_indexes) != 1:
            fail("story-beat form selection has an exact top-score tie")
        expected_token_id = allowed[maximum_indexes[0]]

        original_allowed_scores = tuple(allowed_scores)
        if not hasattr(scores, "fill_"):
            fail("story-beat logits tensor cannot be masked in place")
        scores.fill_(float("-inf"))
        for token_id, score in zip(allowed, original_allowed_scores, strict=True):
            scores[0, token_id] = score
        self._previous_prefix = prefix
        self._previous_expected_token_id = expected_token_id
        self._expected_generated_token_ids.append(expected_token_id)
        return scores

    def finalize(self, full_decoder_token_ids: Any) -> StoryBeatTokenTarget:
        if self._finalized:
            fail("story-beat form selection is already finalized")
        self._finalized = True
        full_sequence = _copy_flat_token_ids(
            full_decoder_token_ids,
            "story-beat full decoder sequence",
        )
        if not full_sequence or full_sequence[0] != DECODER_START_TOKEN_ID:
            fail("story-beat full decoder sequence lacks its decoder-start token")
        generated = full_sequence[1:]
        if (
            not generated
            or generated[-1] != EOS_TOKEN_ID
            or EOS_TOKEN_ID in generated[:-1]
        ):
            fail("story-beat generated ids must contain EOS exactly once at the end")
        if generated != self._expected_generated_token_ids:
            fail("story-beat generated ids differ from the unique maximum trie path")
        selected = [
            target for target in self._targets
            if list(target.token_ids) == generated
        ]
        if len(selected) != 1:
            fail("story-beat generation does not complete exactly one grounded form")
        return selected[0]


def run_evaluation(
    holdout_path: Path,
    model_path: Path,
    output_path: Path,
    holdout: dict[str, Any],
    model_files: list[dict[str, Any]],
    requested_case_count: int,
) -> dict[str, Any]:
    initial_holdout_sha256 = sha256_file(holdout_path)
    enforce_offline_environment()
    try:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, LogitsProcessorList
    except ImportError as error:
        fail(f"required offline ML package is unavailable: {error}")

    torch.set_num_threads(CPU_THREADS)
    torch.set_num_interop_threads(CPU_INTEROP_THREADS)
    torch.manual_seed(SEED)
    torch.use_deterministic_algorithms(True)

    tokenizer = AutoTokenizer.from_pretrained(
        str(model_path),
        local_files_only=True,
    )
    if tokenizer.pad_token_id != PAD_TOKEN_ID or tokenizer.eos_token_id != EOS_TOKEN_ID:
        fail("tokenizer special-token ids differ from the production contract")
    model = AutoModelForSeq2SeqLM.from_pretrained(
        str(model_path),
        local_files_only=True,
        use_safetensors=True,
        torch_dtype=torch.float32,
    )
    if not getattr(model.config, "is_encoder_decoder", False):
        fail("model must be an encoder-decoder checkpoint")
    model.to("cpu")
    model.eval()
    for name, tensor in [
        *model.named_parameters(),
        *model.named_buffers(),
    ]:
        if tensor.is_floating_point() and tensor.dtype != torch.float32:
            fail(f"model tensor is not FP32: {name}")

    selected, selection = select_cases(holdout, requested_case_count)
    rows: list[dict[str, Any]] = []
    for ordinal, (source_ordinal, case, rank_hash) in enumerate(selected):
        facts = story_beat_facts_from_prompt(case["prompt"])
        targets = tokenize_story_beat_targets(tokenizer, facts, ordinal, case["id"])
        logits_processor = GroundedStoryBeatLogitsProcessor(targets)
        encoded = tokenizer(
            case["prompt"],
            add_special_tokens=True,
            padding=False,
            truncation=False,
            return_tensors="pt",
        )
        input_token_count = _token_count(encoded, case["id"])
        generation_inputs = {"input_ids": encoded["input_ids"].to("cpu")}
        if "attention_mask" in encoded:
            generation_inputs["attention_mask"] = encoded["attention_mask"].to("cpu")
        started = time.perf_counter_ns()
        with torch.inference_mode():
            sequences = model.generate(
                **generation_inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
                num_beams=1,
                num_return_sequences=1,
                return_dict_in_generate=False,
                min_length=0,
                min_new_tokens=0,
                repetition_penalty=1,
                no_repeat_ngram_size=0,
                encoder_no_repeat_ngram_size=0,
                bad_words_ids=None,
                force_words_ids=None,
                forced_bos_token_id=None,
                forced_eos_token_id=None,
                suppress_tokens=None,
                begin_suppress_tokens=None,
                guidance_scale=None,
                decoder_start_token_id=DECODER_START_TOKEN_ID,
                pad_token_id=PAD_TOKEN_ID,
                eos_token_id=EOS_TOKEN_ID,
                logits_processor=LogitsProcessorList([logits_processor]),
            )
        elapsed_microseconds = max(0, (time.perf_counter_ns() - started) // 1000)
        ids = _sequence_ids(sequences, case["id"])
        if not ids:
            fail(f"{case['id']} generation returned no decoder-start token")
        generated_token_count = len(ids) - 1
        if generated_token_count > MAX_NEW_TOKENS:
            fail(
                f"{case['id']} generated {generated_token_count} tokens; "
                f"maximum is {MAX_NEW_TOKENS}"
            )
        selected_target = logits_processor.finalize(ids)
        decoded = tokenizer.decode(
            ids[1:],
            skip_special_tokens=True,
            clean_up_tokenization_spaces=CLEAN_UP_TOKENIZATION_SPACES,
        )
        if not isinstance(decoded, str):
            fail(f"{case['id']} tokenizer must decode exactly one string")
        if decoded != selected_target.text:
            fail(f"{case['id']} generated decode differs from its grounded form")
        output = _validate_evidence_output(decoded, f"{case['id']} output")
        rows.append(make_result_row(
            ordinal=ordinal,
            source_ordinal=source_ordinal,
            case=case,
            rank_hash=rank_hash,
            input_token_count=input_token_count,
            generated_token_count=generated_token_count,
            output=output,
            elapsed_microseconds=elapsed_microseconds,
        ))
        print(json.dumps({
            "kind": "story-beat-heldout-progress",
            "completed": ordinal + 1,
            "total": len(selected),
            "caseId": case["id"],
            "elapsedMicroseconds": elapsed_microseconds,
        }, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True), flush=True)

    if regular_file_manifest(model_path) != model_files:
        fail("model closure changed during evaluation")
    if sha256_file(holdout_path) != initial_holdout_sha256:
        fail("holdout changed during evaluation")
    reloaded_holdout = load_holdout(holdout_path)
    if reloaded_holdout != holdout:
        fail("holdout content changed during evaluation")
    validate_fresh_output(output_path)
    evidence = build_evidence(
        model=model_path,
        model_files=model_files,
        holdout_path=holdout_path,
        holdout=holdout,
        selection=selection,
        rows=rows,
    )
    validate_evidence(
        evidence,
        model=model_path,
        model_files=model_files,
        holdout_path=holdout_path,
        holdout=holdout,
    )
    serialized = json.dumps(
        evidence,
        ensure_ascii=False,
        allow_nan=False,
        indent=2,
        sort_keys=True,
    ).encode("utf-8") + b"\n"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(output_path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(serialized)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        raise
    loaded = load_json(output_path, "evaluation output")
    validate_evidence(
        loaded,
        model=model_path,
        model_files=model_files,
        holdout_path=holdout_path,
        holdout=holdout,
    )
    return loaded


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--holdout", required=True, help="separately sealed 200-row holdout JSON")
    parser.add_argument("--model", required=True, help="local trained safetensors checkpoint")
    parser.add_argument("--output", required=True, help="fresh JSON evidence file")
    parser.add_argument(
        "--case-count",
        type=int,
        default=HOLDOUT_CASE_COUNT,
        help=f"deterministic smoke subset size; default/full is {HOLDOUT_CASE_COUNT}",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="validate input/model closures and selection without importing ML packages",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    holdout_path = checked_path(args.holdout, "holdout")
    model_path = checked_path(args.model, "model")
    output_path = checked_path(args.output, "output")
    validate_paths(holdout_path, model_path, output_path)
    holdout = load_holdout(holdout_path)
    model_files = validate_model(model_path)
    selected, selection = select_cases(holdout, args.case_count)
    if args.validate_only:
        print(json.dumps({
            "schemaVersion": SCHEMA_VERSION,
            "corpusHash": holdout["corpusHash"],
            "holdoutRows": len(holdout["cases"]),
            "selectedRows": len(selected),
            "selectedIdsHash": selection["selectedIdsHash"],
            "modelFiles": len(model_files),
            "modelTreeSha256": model_evidence(model_path, model_files)["treeSha256"],
            "outputFresh": True,
            "mlPackagesImported": False,
        }, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True))
        return 0
    evidence = run_evaluation(
        holdout_path,
        model_path,
        output_path,
        holdout,
        model_files,
        args.case_count,
    )
    print(json.dumps({
        "kind": evidence["kind"],
        "contentHash": evidence["contentHash"],
        "rows": evidence["summary"]["rowCount"],
        "outputPath": str(output_path),
        "outputFileSha256": sha256_file(output_path),
        "modelAdmitted": False,
        "displayAuthorized": False,
    }, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"story-beat heldout evaluation refused: {error}", file=sys.stderr)
        raise SystemExit(2)
