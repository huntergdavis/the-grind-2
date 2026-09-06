# Factual story-beat V2 export and offline training

These developer-only tools export the committed factual story-beat V2 corpus
into physically separate train/development and sealed-holdout files, then
train a local CPU checkpoint from train/development only. They do not run in
the game, publish or admit a model, or authorize display.

The V2 exporter is separate from the frozen V1 training path. It loads the
production TypeScript corpus through its production validator, independently
checks the complete corpus hash, and projects only `id`, `split`, `prompt`
and `target`. Each projected row and envelope gets a new canonical hash.

From the repository root, first create the already-ignored parent and then
write one fresh child:

~~~sh
mkdir -p .narrator-t5-rebuild
node tools/narrator-story-beat-v2-training/export-corpus.mjs \
  --output .narrator-t5-rebuild/story-beat-v2-export-001
~~~

The destination is created with mode 0700. Its three mode-0600 files are:

- `train-dev.json`: 1,000 train plus 128 development rows;
- `sealed-holdout.json`: 200 rows that must never enter training;
- `export-manifest.json`: V1 source, V2 source, projected corpus, byte-length
  and SHA-256 bindings with model admission and display authorization fixed
  false.

Only `train-dev.json` may be passed to the V2 trainer.

## Validate the V2 training closure

The V2 entry point reuses the complete, proven V1 CPU training core at pinned
SHA-256
`459fab2643c1d2bc328606ebcfa6adfd4ec278575d6c99327ab2ef242569ef79`.
It loads that core into a private module instance and applies only this
separate profile:

- corpus and receipt schema version 2;
- seed 20260906, CPU only, batch size 1, accumulation 8, and 3 epochs;
- maximum 384 source and 48 target tokens, with no truncation;
- Adafactor at 1e-3, deterministic algorithms, four intra-op threads, one
  inter-op thread, zero loader workers, and seeded shuffling.

Validation checks the full corpus hash, every row hash, train/dev-only split
closure, source-model closure, symlink boundaries, and a fresh destination.
It does not import PyTorch or Transformers and leaves the destination absent:

~~~sh
python3 tools/narrator-story-beat-v2-training/train.py \
  --validate-only \
  --corpus .narrator-t5-rebuild/story-beat-v2/export-d66b901-001/train-dev.json \
  --source .narrator-t5-rebuild/publication/source \
  --destination .narrator-t5-rebuild/story-beat-v2/checkpoint-v2-001
~~~

The production preflight reports corpus hash `c85cbc360a1a7a84`, 1,000
training rows, 128 development rows, and admission/display authority false.

Run both V2 fixture suites directly without changing the repository's
currently dirty package manifest:

~~~sh
node --test tools/narrator-story-beat-v2-training/export-corpus.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tools/narrator-story-beat-v2-training/train_test.py -v
~~~

## Train

Use the already verified offline Python environment and local safetensors
source. Do not install packages or fetch a model during the run:

~~~sh
PYTHONHASHSEED=20260906 python3 tools/narrator-story-beat-v2-training/train.py \
  --corpus .narrator-t5-rebuild/story-beat-v2/export-d66b901-001/train-dev.json \
  --source .narrator-t5-rebuild/publication/source \
  --destination .narrator-t5-rebuild/story-beat-v2/checkpoint-v2-001
~~~

The process emits one compact factual-V2 progress record per epoch. Its fresh
checkpoint and receipt bind the source closure, corpus, recipe, packages,
losses, and every output byte while retaining
`modelAdmitted=false` and `displayAuthorized=false`. Sealed evaluation,
browser evidence, publication, worker transport, and Chronicle integration
remain separate later features.

## Completed checkpoint — 2026-09-06

The first production-corpus run completed once inside the same pinned,
network-disabled CPU environment previously proven by the V1 training path.
Only the read-only source and train/development corpus plus one fresh output
mount were visible to the process; the sealed holdout was not mounted. The
validated schema-2 receipt records:

- source tree SHA-256
  `b0be7b935d129f9b38863015c2c18375b398d7f4f994609214684fce74aa86f4`
  across eight source files;
- train/development corpus hash `c85cbc360a1a7a84` and file SHA-256
  `4dca3ed0fe42d03a885143bd3aad1810e876e312dcaf1a75f1bb9abc9cb70bb1`;
- 1,000 training rows, 128 development rows and exactly 375 optimizer steps;
- mean training losses `0.24255373582034373`,
  `0.04269638903182931` and `0.018933417036500033`, with final
  development loss `0.5221119575980993`;
- eight receipt-bound artifact files totaling 311,106,466 bytes, including
  `model.safetensors` at SHA-256
  `d05fdc8359af2255e26e26f7861ddfda0ba1e02db737a8471adc25bdc3919e51`;
- receipt payload SHA-256
  `0e669f4a89407f010dc2e684fca56394458f1eec943e46a2ec852b2c8ed59055`
  and receipt-file SHA-256
  `15e5149dd8f4ac5440ff0787d2d743c8d7a0520ed3cd7c7a09ec4acee0d2a2ad`.

The committed validator independently reloaded the receipt and rehashed the
complete nine-file, 311,111,052-byte directory after the training container
exited. This is a reproducible local FP32 checkpoint, not a quality result:
`modelAdmitted=false` and `displayAuthorized=false` remain fixed. The next
atomic feature is the independent, unconstrained FP32 sealed-holdout evaluator;
q8 rebuild/publication and real browser evidence remain behind that result.

## Raw sealed FP32 evaluator

`evaluate.py` is a separate schema-2 evidence generator. It pins the complete
V1 evidence/path/model core at SHA-256
`429e41269f8f82f90b2271d2ab0961c855a28291b1eb26bb11bd57e176c10dc0`,
then changes only the factual V2 profile: seed 20260906, 384 input tokens, the
exact nine-line factual prompt, V2 holdout IDs and unconstrained greedy
generation. Its pass-through logits observer verifies decoder continuity but
returns every score unchanged. Reference targets are never tokenized or made
available to that observer.

Validation-only mode parses every exact V2 prompt as well as checking the
200-row corpus hash, deterministic selection, model closure and fresh output.
It does not import ML packages or create the result:

~~~sh
python3 tools/narrator-story-beat-v2-training/evaluate.py \
  --validate-only \
  --holdout .narrator-t5-rebuild/story-beat-v2/export-d66b901-001/sealed-holdout.json \
  --model .narrator-t5-rebuild/story-beat-v2/checkpoint-v2-001 \
  --output .narrator-t5-rebuild/story-beat-v2/fp32-raw-001.json
~~~

The real preflight sees sealed corpus `164200f6c558639e`, all 200 rows,
checkpoint tree SHA-256
`fd51ae52304466f7b685fcf89ba45966280f706e8b62c510c242a58e4d3912c5`
and nine model files. Eight focused V2 evaluator tests and the combined
23-test V1/V2 run pass.

One real, pinned-image, network-disabled smoke generated holdout row 0172 in
4.696105 seconds:

> Vika Bell gracefully guards the offset ramparts at Cesta Bridge Span as
> combat defeat count rises from 0 to 1.

That is useful negative evidence, not a pass. The model included the exact
required combat-defeat clause and did not copy the reference target, but the
production V2 validator correctly rejected `Cesta Bridge Span`: the supplied
place was `Crimson Bridge Span`. The private mode-0600 raw evidence has
content hash `584d33d01f4aa327` and file SHA-256
`71f1466fe8dd052521b36317e9315ccd7aa31841d22396132e70804894d102b1`;
it grants no admission or display authority.

## Independent production-contract scorer

`validate-evaluation.mjs` consumes raw evidence only after generation. It
independently reloads the committed production corpus and factual V2
validator, reconstructs the exact sealed projection and deterministic
selection, hashes the holdout, result bytes and complete checkpoint closure,
and rejects schema, identity, token/timing, path, model, content or authority
drift. Reference targets are available only to this post-generation scorer for
measuring exact-copy incidence.

The complete 200-row gate is frozen at:

- at least 198 first-pass-valid and 198 unique outputs;
- all 200 outputs containing every required mechanic clause and the exact
  supplied place;
- zero outputs with unknown words, unknown capitalized words, unknown numeric
  claims, prompt echoes or deterministic-fallback copies;
- at least six delexicalized output shapes, with no shape used more than 60
  times.

A partial run receives `qualityGate.evaluated=false` and `passed=null`.
Passing a complete quality gate still leaves `modelAdmitted=false` and
`displayAuthorized=false`; admission, q8 publication, browser evidence and
runtime integration remain separate features.

Score one result closure and optionally create one fresh mode-0600 report:

~~~sh
node tools/narrator-story-beat-v2-training/validate-evaluation.mjs \
  --holdout .narrator-t5-rebuild/story-beat-v2/export-d66b901-001/sealed-holdout.json \
  --results .narrator-t5-rebuild/story-beat-v2/fp32-raw-001.json \
  --model .narrator-t5-rebuild/story-beat-v2/checkpoint-v2-001 \
  --report .narrator-t5-rebuild/story-beat-v2/fp32-report-001.json
~~~

A fresh one-row run with host/container paths mirrored produced the same
wrong-place sentence and was accepted as an intact artifact, then classified
as 0/1 first-pass valid, 1/1 required clauses, 0/1 exact place, one unknown
word and one unknown capitalized word. Its raw content hash is
`777f8810694e355a` and file SHA-256 is
`c268e3fb4b8f6525dd23ed767fcacdc821797853eea2c1ac8dbd038a99370cbb`.
The exclusive report has content hash `d484bd54c805060c` and file SHA-256
`05bb8d5975cc4153ca4b5303a054aa8478d574a14a7a40d463c3efc0e62c8bda`.
It is deliberately not a quality-gate result.

Run the scorer regressions and evidence-generator tests with:

~~~sh
node --test \
  tools/narrator-story-beat-training/validate-evaluation.test.mjs \
  tools/narrator-story-beat-v2-training/validate-evaluation.test.mjs
python3 tools/narrator-story-beat-v2-training/evaluate_test.py
~~~

All 19 combined scorer tests and all eight Python evaluator tests pass.

## Complete unconstrained FP32 result — 2026-09-06

The complete evaluator ran once in the pinned Python image with networking,
capabilities and privilege escalation disabled. The repository, checkpoint,
holdout and wheelhouse were read-only; only one fresh mode-0700 evidence
directory was writable. All 200 rows completed before the mode-0600 raw file
was created. Measured inference totaled 882,239,481 microseconds, with 143–168
input tokens, 17–41 generated tokens and a mean of 4,411,197 microseconds per
row.

The model did write varied, mechanically grounded storyline. All 200 outputs
were unique, spanning 71 delexicalized shapes with maximum frequency 11. One
valid non-reference form was:

> At Tawny Pass Reach, Pava Willow gracefully steadies the windworn pack
> animals while combat stalemate count rises from 0 to 1.

The frozen quality gate nevertheless failed, honestly and decisively:

- 66/200 first-pass valid;
- 198/200 contained every exact required mechanic clause;
- 133/200 retained the exact supplied place;
- 131/200 contained an unknown word, including 123 with an unknown
  capitalized word;
- zero invented numeric claims, prompt echoes or fallback copies;
- 27/67 cost, 24/67 consequence and 15/66 contrast outputs valid;
- 40 exact reference-target copies, measured only after generation.

Inspection shows a concentrated failure rather than general collapse: names
and locations are often changed phonetically (`Dara` to `Della`, `Rhea` to
`Riven`, `Golden` to `Silver`), while required numeric mechanics are
nearly always preserved. The result receives no admission or display
authority.

The raw evidence has content hash `0245ba04867ca5b3`, file SHA-256
`45d151f6d7c77fca7b30ebc3ef56d9bf76823879c8ff69469177b590bcf60c6c`
and byte length 155,362. The independent report has content hash
`4f4be541f72a5beb`, file SHA-256
`5aa46b31eb6299484509a38d52ac453774bbfbc8dc1728a90798f0a6bd22d87b`
and byte length 2,132. Both files are mode 0600; both authority flags remain
false.

The next atomic feature is a separate factual V2 grounded decoder adapted from
the proven V1 eligible-form token trie. Host code will construct only
production-valid candidates containing the exact mechanic clauses; the model
will score which eligible line wins, with exact score ties rejected. The full
FP32 gate must then be rerun unchanged before q8 publication or any
player-facing use.

## Grounded FP32 evaluator

`evaluate_grounded.py` delivers that recovery as a separate entry point. It
pins the unchanged raw V2 wrapper at SHA-256
`305f35a9f86f3e565cf76b0aa2f3ea96a4122ebd755c7ab08527b5dd2828cf6f`
and loads a fresh instance of the proven V1 evaluation core. No raw contract or
historical evidence bytes change.

For each exact prompt, host code constructs bounded candidates from only:

- the supplied location and every exact required mechanic clause;
- the full authored action or its given-name/authored-verb compact form;
- the supplied headline or consequence;
- the six learned prefix/interior/suffix × `as`/`while` frames.

Each frame retains between one and four candidates after the unchanged
24-word, 160-character and safe-Unicode checks. Candidate text must include the
location exactly once and every mechanic clause exactly once. Only candidates
that round-trip through the local tokenizer within 48 tokens enter the trie.
The model's original logits select among them; every other token is masked, and
an exact top-score tie or discontinuous decoder path fails closed. Neither
held-out reference targets nor deterministic fallbacks enter candidate
construction.

Run the no-ML preflight or a sealed evaluation with:

~~~sh
python3 tools/narrator-story-beat-v2-training/evaluate_grounded.py \
  --validate-only \
  --holdout .narrator-t5-rebuild/story-beat-v2/export-d66b901-001/sealed-holdout.json \
  --model .narrator-t5-rebuild/story-beat-v2/checkpoint-v2-001 \
  --output .narrator-t5-rebuild/story-beat-v2/grounded-fp32-001.json
~~~

The real preflight accepts all 200 rows, selected-ID hash
`9e5225f13fcad79b` and model tree SHA-256
`fd51ae52304466f7b685fcf89ba45966280f706e8b62c510c242a58e4d3912c5`
without importing ML packages or creating output. The permanent
cross-language regression sends Python only IDs/prompts—not targets—and proves
all 3,612 derived forms pass the real TypeScript production validator. Every
row has 6–24 forms.

Eight grounded Python tests, the unchanged eight raw-evaluator tests and the
cross-language production test pass:

~~~sh
python3 tools/narrator-story-beat-v2-training/evaluate_grounded_test.py
python3 tools/narrator-story-beat-v2-training/evaluate_test.py
node --test \
  tools/narrator-story-beat-v2-training/evaluate-grounded-production.test.mjs
~~~

A real pinned-image, network-disabled one-row smoke made the model select:

> At Crimson Bridge Span, Vika Bell gracefully guards the offset ramparts as
> combat defeat count rises from 0 to 1.

The production validator accepts the line. It used 32 generated tokens and
5,241,852 inference microseconds. The private mode-0600 evidence has content
hash `e0185cab06b49589`, file SHA-256
`b839639e1ff27e682c7cae63f1adc51d271eb8ba3286c6e8604b01374584ef70`
and byte length 4,341. Model admission and display authorization remain false.

## Grounded evidence scorer

`validate-grounded-evaluation.mjs` is the independent scorer for the grounded
decoder. It reuses the raw scorer's file, corpus, checkpoint, selection and
quality checks, but requires the exact grounded generation contract and emits
the distinct report kind
`factual-story-beat-v2-grounded-heldout-validation-report`. Raw evidence is
rejected by the grounded profile and grounded evidence is rejected by the raw
profile; there is no ambiguous auto-detection or repair path. Refactoring the
shared file-validation core left the historical unconstrained report
byte-identical at SHA-256
`5aa46b31eb6299484509a38d52ac453774bbfbc8dc1728a90798f0a6bd22d87b`.

Run the grounded scorer with:

~~~sh
node tools/narrator-story-beat-v2-training/validate-grounded-evaluation.mjs \
  --holdout .narrator-t5-rebuild/story-beat-v2/export-d66b901-001/sealed-holdout.json \
  --results .narrator-t5-rebuild/story-beat-v2/evaluations/grounded-smoke-001/raw.json \
  --model .narrator-t5-rebuild/story-beat-v2/checkpoint-v2-001 \
  --report .narrator-t5-rebuild/story-beat-v2/evaluations/grounded-smoke-001/report.json
~~~

The real one-row smoke report accepts integrity and records 1/1 first-pass
valid, 1/1 exact-place and required-clause complete, with zero unknown words,
capitalized words, numeric claims, prompt echoes or copies. A smoke is not the
200-row gate, so `qualityGate.evaluated=false`, `passed=null`, and admission and
display authority remain false. The mode-0600 report has content hash
`48ec9871368dec7d`, file SHA-256
`dc1b2cf2d426b61ffd0bbeb0bd86ff411fa56d8321076b5968798babfe592f69`
and byte length 2,115.

The unchanged V1 scorer suite passes 11/11 and the expanded V2 suite passes
10/10, including a complete 200-row production-target control and reciprocal
raw/grounded rejection. The next atomic feature is the complete sealed,
network-disabled 200-row grounded FP32 gate. Publication and player-facing use
remain prohibited until that evidence passes independently.
