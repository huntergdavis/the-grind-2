# Factual story-beat V2 training export

This developer-only tool exports the committed factual story-beat V2 corpus
into physically separate train/development and sealed-holdout files. It does
not run in the game, train or publish a model, admit generated text, or
authorize display.

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

Only `train-dev.json` may be passed to the future V2 trainer. The trainer,
checkpoint rebuild, sealed evaluation, browser evidence, worker transport and
Chronicle integration remain separate later features.

Run the exporter tests directly without changing the repository's currently
dirty package manifest:

~~~sh
node --test tools/narrator-story-beat-v2-training/export-corpus.test.mjs
~~~
