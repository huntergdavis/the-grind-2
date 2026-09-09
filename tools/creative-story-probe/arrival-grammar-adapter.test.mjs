import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { arrivalSentenceGrammar, inspectArrivalOutputShape } from './arrival-output-shape.mjs';
import { arrivalGrammarIdentity, createArrivalGrammarRequest, createArrivalGrammarDiagnostics,
  isCompleteArrivalGrammarEvidence, instrumentArrivalGrammarWorker, instrumentArrivalGrammarRuntime,
  arrivalGrammarPlugin } from './arrival-grammar-adapter.mjs';
import { adaptCandidateWorker } from './webgpu-candidate-adapter.mjs';
import { instrumentSamplingRuntime } from './webgpu-sampling-diagnostics.mjs';
import { instrumentModelBufferRuntime } from './webgpu-model-buffer-diagnostics.mjs';
import { instrumentDispatchRuntime } from './webgpu-dispatch-diagnostics.mjs';
import { instrumentSubmissionRuntime } from './webgpu-submission-diagnostics.mjs';
import { instrumentCompleteStoryRuntime, instrumentCompleteStoryWorker } from './webgpu-complete-story.mjs';
import { instrumentShaderRepairRuntime } from './webgpu-shader-repair.mjs';
import { instrumentWriteTimingRuntime, instrumentWriteTimingWorker } from './webgpu-write-timing.mjs';

const runtimePath = resolve('node_modules/@mlc-ai/web-llm/lib/index.js');
const runtime = readFileSync(runtimePath, 'utf8');
const workerPath = resolve('src/narrator/creative-writer.worker.ts');

test('actual worker request carries the exact grammar while request and native events remain distinct', () => {
  const records = [];
  const request = createArrivalGrammarRequest(arrivalSentenceGrammar, arrivalGrammarIdentity, r => records.push(r));
  assert.deepEqual(request(), { type: 'grammar', grammar: arrivalSentenceGrammar });
  request(); assert.equal(records.length, 1);
  assert.equal(isCompleteArrivalGrammarEvidence(records), false);
  const native = createArrivalGrammarDiagnostics(arrivalSentenceGrammar, arrivalGrammarIdentity, r => records.push(r));
  const pipeline = { getCurRoundGrammarInitTotalTime: () => 0.25, getCurRoundGrammarPerTokenTotalTime: () => 0.003 };
  const config = { response_format: request(), enable_thinking: false, max_tokens: 68 };
  for (const invalid of [undefined, { ...config, max_tokens: 1 }, { ...config, enable_thinking: true },
    { ...config, response_format: { type: 'grammar', grammar: 'root ::= "other"' } }]) native.accepted(pipeline, invalid, true);
  assert.equal(records.length, 1);
  native.accepted(pipeline, config, true); native.accepted(pipeline, config, true);
  assert.equal(records.length, 2);
  assert.equal(records[1].grammarInitMs, 250); assert.equal(records[1].grammarPerTokenMs, 3);
  assert.equal(isCompleteArrivalGrammarEvidence(records), true);
  for (const invalid of [[...records].reverse(), [...records, records[1]],
    [records[0], { ...records[1], accepted: false }],
    [records[0], { ...records[1], grammarInitMs: null }],
    [records[0], { ...records[1], grammarSha256: 'wrong' }],
    [records[0], { ...records[1], error: 'missing stats' }]]) assert.equal(isCompleteArrivalGrammarEvidence(invalid), false);
  assert.ok(records.every(record => JSON.stringify(record).length < 2000));
});

test('grammar observation preserves native rejection and never turns observer failure into a generation error', () => {
  const records = [], config = { response_format: { type: 'grammar', grammar: arrivalSentenceGrammar }, enable_thinking: false, max_tokens: 68 };
  const native = createArrivalGrammarDiagnostics(arrivalSentenceGrammar, arrivalGrammarIdentity, r => records.push(r));
  native.accepted({}, config, false);
  assert.equal(records[0].accepted, false);
  assert.match(records[0].error, /getCurRoundGrammarInitTotalTime/u);
  const throwing = createArrivalGrammarDiagnostics(arrivalSentenceGrammar, arrivalGrammarIdentity, () => { throw Error('observer'); });
  assert.doesNotThrow(() => throwing.accepted({}, config, false));
  const request = createArrivalGrammarRequest(arrivalSentenceGrammar, arrivalGrammarIdentity, () => { throw Error('observer'); });
  assert.deepEqual(request(), { type: 'grammar', grammar: arrivalSentenceGrammar });
});

test('pinned runtime inserts the empty thinking header outside grammar acceptance and initializes before sampling', () => {
  const pkg = JSON.parse(readFileSync(resolve('node_modules/@mlc-ai/web-llm/package.json'), 'utf8'));
  assert.equal(pkg.version, '0.2.85'); assert.equal(pkg.devDependencies['@mlc-ai/web-xgrammar'], '0.1.27');
  const prefill = runtime.slice(runtime.indexOf('    prefillStep(inp, msgRole,'), runtime.indexOf('    decodeStep(genConfig)'));
  const header = 'this.outputIds.push(...encoded);\n                    conversation.appendEmptyThinkingReplyHeader(Role.assistant, emptyThinkingBlockStr);';
  assert.ok(prefill.includes(header));
  assert.ok(prefill.indexOf(header) < prefill.indexOf('yield grammarMatcherInitPromise;'));
  assert.ok(prefill.indexOf('yield grammarMatcherInitPromise;') < prefill.indexOf('nextToken = yield this.sampleTokenFromLogits(logits, genConfig);'));
  assert.equal(prefill.includes('acceptToken('), false);
  assert.equal(runtime.split('this.grammarMatcher.acceptToken(sampledToken)').length, 2);
  assert.ok(runtime.includes('responseFormat.type === "grammar"\n                                        ? yield this.grammarCompiler.compileGrammar(responseFormat.grammar)'));
  assert.equal(arrivalSentenceGrammar.includes('<think>'), false);
});

test('isolated adapter touches streaming write only and native acceptance only after the original matcher call', () => {
  const originalWorker = readFileSync(workerPath, 'utf8');
  const sourceWorker = instrumentWriteTimingWorker(instrumentCompleteStoryWorker(adaptCandidateWorker(originalWorker)));
  const worker = instrumentArrivalGrammarWorker(sourceWorker);
  assert.doesNotMatch(worker, /selectCreativeStoryBudgetFallback|TG2_WRITER_BUDGET|__tg2SelectSentenceBudgetFallback/u);
  assert.ok(worker.includes('response_format: __tg2ArrivalGrammarRequest(), stream: true, max_tokens: 68, temperature: 0.7, top_p: 0.85, seed: 7'));
  assert.equal(worker.split('response_format: __tg2ArrivalGrammarRequest()').length, 2);
  for (const marker of ['stream: false, max_tokens: 1, temperature: 0, top_p: 1, seed: 7',
    'await model.interruptGenerate();', 'for await (const chunk of chunks)', 'buildCreativeWriterConversation(boundedMessages)',
    'hasFinishedCreativeStoryPassage(stripEmptyThinkingHeader(text))']) {
    assert.equal(worker.split(marker).length, sourceWorker.split(marker).length, marker);
  }
  const sourceRuntime = instrumentWriteTimingRuntime(instrumentShaderRepairRuntime(instrumentCompleteStoryRuntime(
    instrumentSubmissionRuntime(instrumentDispatchRuntime(instrumentModelBufferRuntime(instrumentSamplingRuntime(runtime)))))));
  const transformed = instrumentArrivalGrammarRuntime(sourceRuntime);
  for (const marker of ['this.grammarMatcher.acceptToken(sampledToken)', 'this.fapplyBitmask(',
    'yield this.device.sync();', 'this.tvm.uniform([1], 0.0, 1.0, this.device)',
    'if (!accepted) {\n                    throw Error("Grammar matcher rejected the newly sampled token.");']) {
    assert.equal(transformed.split(marker).length, sourceRuntime.split(marker).length, marker);
  }
  const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: transformed, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
  const plugin = arrivalGrammarPlugin(process.cwd(), [runtimePath]);
  assert.equal(plugin.transform(sourceWorker, workerPath + '?worker_file').code, worker);
  assert.equal(plugin.transform(sourceRuntime, runtimePath).code, transformed);
  assert.equal(plugin.transform(sourceWorker, workerPath + '.backup'), null);
  assert.throws(() => instrumentArrivalGrammarWorker(originalWorker), /timed candidate/u);
  assert.throws(() => instrumentArrivalGrammarWorker(worker), /exactly once/u);
  assert.throws(() => instrumentArrivalGrammarWorker(sourceWorker.replace('stream: true, max_tokens: 68,', 'CHANGED')), /no longer matches/u);
  assert.throws(() => instrumentArrivalGrammarRuntime(runtime), /timed repaired/u);
  assert.throws(() => instrumentArrivalGrammarRuntime(transformed), /exactly once/u);
  assert.throws(() => instrumentArrivalGrammarRuntime(sourceRuntime.replace('const accepted = this.grammarMatcher.acceptToken(sampledToken);', 'CHANGED')), /no longer matches/u);
  assert.equal(readFileSync(workerPath, 'utf8'), originalWorker);
  assert.equal(readFileSync(runtimePath, 'utf8'), runtime);
});

test('actual bundled xgrammar CPU compiler agrees with lexical shape boundaries without a thinking prefix', async () => {
  // WebLLM bundles its CPU/WASM grammar engine; use those installed bytes, no install or network.
  const begin = 'var lib$3 = {exports: {}};', end = 'var libExports$1 = requireLib$1();';
  assert.equal(runtime.split(begin).length, 2); assert.equal(runtime.split(end).length, 2);
  const bundle = runtime.slice(runtime.indexOf(begin), runtime.indexOf(end) + end.length);
  const xg = new Function('createRequire', 'location', bundle + '\nreturn libExports$1;')(
    createRequire, { href: pathToFileURL(runtimePath).href });
  const tokenizer = await xg.TokenizerInfo.createTokenizerInfo([]);
  const compiler = await xg.GrammarCompiler.createGrammarCompiler(tokenizer, false);
  let compiled;
  try {
    compiled = await compiler.compileGrammar(arrivalSentenceGrammar);
    const sentence = (count, word = 'word') => Array(count).fill(word).join(' ') + '.';
    const accepted = [sentence(12) + ' ' + sentence(15), sentence(15) + ' ' + sentence(12),
      sentence(12, 'a'.repeat(24)) + ' ' + sentence(12),
      sentence(12, "Rowan's") + ' ' + sentence(12, 'Rowan’s'),
      sentence(12, 'well-known') + ' ' + sentence(12),
      (Array(12).fill('word').join(', ') + '.') + ' ' + sentence(12)];
    const rejected = [sentence(11) + ' ' + sentence(12), sentence(12) + ' ' + sentence(16),
      sentence(12, 'a'.repeat(25)) + ' ' + sentence(12),
      sentence(12, 'two--parts') + ' ' + sentence(12),
      sentence(12) + ' ' + sentence(12) + ' ',
      '<think>\n\n</think>\n\n' + sentence(12) + ' ' + sentence(12)];
    for (const [texts, expected] of [[accepted, true], [rejected, false]]) {
      for (const text of texts) {
        const matcher = await xg.GrammarMatcher.createGrammarMatcher(compiled, undefined, true);
        try {
          const valid = matcher._acceptString(text) && matcher.isTerminated();
          assert.equal(valid, expected, text);
          assert.equal(valid, inspectArrivalOutputShape(text).valid, text);
        } finally { matcher.dispose(); }
      }
    }
  } finally { compiled?.dispose(); compiler.dispose(); tokenizer.dispose(); }
});
