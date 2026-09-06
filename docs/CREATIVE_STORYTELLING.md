# Creative local storytelling: next visible slice

Status: planned after the manual Story Beat lockout repair; no creative model
has been selected, downloaded or tested for this slice yet.

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

Research starting point, not a selected winner: Hugging Face's
[SmolLM2 model card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct)
documents instruction tuning, rewriting and Transformers.js generation. A
[browser ONNX conversion](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX-MHA)
is available. Its story quality remains unmeasured here. Test larger candidates
if the small model only paraphrases; do not claim creativity from its model
name. [Transformers.js WebGPU documentation](https://huggingface.co/docs/transformers.js/en/guides/webgpu)
describes GPU execution, but WASM and WebGPU performance must be measured
separately on the chosen artifact.
