# Creative local storytelling: experimental slice

Status: a separate, opt-in **Creative storyteller** is implemented with the
pinned SmolLM2 135M q8 browser model and 48 original writing seeds. This is a
usable experiment, **not a passed prose-quality gate or a default narrator**.
The manual factual Story Beat lockout repair remains in place.

## Current interaction

Open Local Narrator and choose **Download & try creative writer**. Initial
model/tokenizer/config assets are 139,538,098 bytes; the local ONNX runtime adds
23,614,439 bytes (about 163 MB together, disclosed as approximately 165 MB).
Model bytes are downloaded directly from the pinned model repository; no model
files or inference server are added to this game's repository.

The loader checks a versioned browser Cache Storage namespace first. A complete
saved model and runtime changes the action to **Use saved model** and permits
cache-only restoration; partial cached files are reused during an explicitly
requested load. Turning off or canceling retains saved files. **Remove saved
creative model** clears only that model's namespace, not game saves or the
classic narrator cache. An app asset-cache update does not delete model caches.
The cache is specific to this browser/profile and site origin, not a general
scan of files elsewhere on the machine. A classic T5 cache is not a SmolLM cache.
There is no automatic model load/download on a fresh page in this first slice.

After loading, **Tell this scene** pauses the adventure, retrieves one
scene-compatible seed, and asks the worker for original prose. **Try another
idea** rotates the seed; finished, failed, canceled, and stale requests release
busy state. The pause is deliberate: press Resume to continue reading the next
event. The source and its exact consequence stay separate from the literary
interpretation. Text never enters the simulation, Chronicle record or save.
Loading either narrator turns the other off to avoid retaining both runtimes.

The short experimental output cap is 64 new tokens with a 90-second deadline;
the cleaner keeps up to two complete sentences and drops an unfinished tail.
It checks text hygiene, not truth or literary quality. Combat, cutaways and
hidden views suppress the creative surface. There is no sentence trie or
source-word allowlist, and inference networking is closed after asset load.

Continuity: `deja "model cache"` recovered the earlier turn-off/retain-cache and
explicit-removal design. This slice reuses that separation from the
[classic controller](../src/ui/local-narrator-controller.ts) and the existing
[stable-scene pause helper](../src/ui/story-beat-write.ts); it does not reuse
the classic model's weights or finite-output decoder.

## Evidence and remaining quality gate

The [browser probe](../tools/creative-story-probe/README.md) records four actual
offline generations with and without a rich seed. Seeds changed mood and
imagery, but the model also invented biography, omitted costs, and once reversed
an action. All four raw samples hit the token ceiling. On the two-thread
cross-origin-isolated test server they took 33–38 seconds; those figures are
not production single-thread performance. The production worker/cache probe is
reported separately alongside those samples. It restored the model after worker
disposal in 23.215 seconds with no model/runtime requests. A final single-thread
production-prompt run generated two accepted sentences in 55.419 seconds with
zero generation requests. Those sentences still invented an island and muddled
a payment: successful display does not establish good storytelling. The initial
structured prompt's rejected code-like output is preserved too; the current
short plain-language prompt avoids that failure in the recorded example.

The player's library idea therefore buys controllable inspiration, not
reliable storytelling by itself. The original eight-scene quality review and
longer two-to-four-sentence target below remain open. Next compare a more
capable writer and concise exemplars against these same scenes, measuring
relevance, invention, repetition, time to first complete sentence, and memory.
Do not expand to thousands of seeds merely to inflate a variety count.

The player's next direction is **character interiority**: varied feelings,
private thoughts, hopes and worries that make the hero worth following. The next
comparison should make one emotional reaction the subject of each short passage,
instead of hoping a fact summary acquires feeling from an added metaphor. Vary
the emotional angle through a bounded host-selected inspiration pool, keeping
that literary interpretation separate from authoritative game state. Before
mentioning a relationship, supply an actual public party/relationship fact;
do not ask a small model to invent companions or a shared history. Measure
whether readers can identify a distinct feeling and concern in the output.

## Original target and acceptance (still open)

The player feedback is accurate: current Story Beats select from a finite set
of factual sentence forms. Both story Transformers adapters install a trie
logits processor; V2 additionally requires mechanics clauses. Those constraints
prevent the model from composing a scene. More scheduling cannot fix this.

The next deliverable is one complete interaction: choose a committed event,
click **Tell this scene**, and read two to four original sentences with
atmosphere, character voice and a reaction to what happened. Keep the exact
event and mechanical changes separately visible in Chronicle. Generated prose
is a literary interpretation and cannot execute commands or change the game.

Implementation and acceptance:

1. Test a small instruction-tuned causal model in the browser with the existing
   Transformers.js stack. Use its chat template and decode the generated suffix.
   Keep actual outputs and timings from eight fixed scene inputs. Judge whether
   those samples read like engaging prose before choosing a model by size.
2. Generate without the current sentence trie or source-word allowlist. Allow
   new imagery and interior reactions; constrain length and text rendering.
   Keep factual source identity, cancellation and the game's authoritative
   record independent of the writer. Reject empty, broken or prompt-echo output.
3. Wire one explicit action through the worker to Chronicle, showing the
   factual source during generation. Distinguish model prose from fallback.
   Retrying after completion must work. Add no automatic download or server
   inference path; disclose any changed model download before activation.
4. Inspect real generated samples in the actual UI at compact and desktop
   widths, including combat suppression. Prove inference works offline after
   loading. Save the prompt, model revision, outputs and measured runtime with
   the feature so quality claims are inspectable. Mocked text and expanded
   template catalogs do not satisfy this acceptance.

Research starting point, not a quality-approved winner: Hugging Face's
[SmolLM2 model card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct)
documents instruction tuning, rewriting and Transformers.js generation. A
[browser ONNX conversion](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX-MHA)
is available. Its measured weaknesses are recorded above. Test larger candidates
if the small model only paraphrases; do not claim creativity from its model
name. [Transformers.js WebGPU documentation](https://huggingface.co/docs/transformers.js/en/guides/webgpu)
describes GPU execution, but WASM and WebGPU performance must be measured
separately on the chosen artifact.
