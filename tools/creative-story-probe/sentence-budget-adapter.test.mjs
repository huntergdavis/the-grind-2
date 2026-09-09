import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { before, after } from 'node:test';
import { createServer, transformWithOxc } from 'vite';
import { selectSentenceBudgetFallback } from './sentence-budget.mjs';
import { adaptCandidateWorker } from './webgpu-candidate-adapter.mjs';
import { instrumentCompleteStoryWorker } from './webgpu-complete-story.mjs';
import { instrumentWriteTimingWorker } from './webgpu-write-timing.mjs';
import { emitSentenceBudgetDecision, instrumentSentenceBudgetWorker, sentenceBudgetPlugin,
  isCompleteSentenceBudgetEvidence } from './sentence-budget-adapter.mjs';

const workerPath = resolve('src/narrator/creative-writer.worker.ts');
const original = readFileSync(workerPath, 'utf8');
const adapted = instrumentWriteTimingWorker(instrumentCompleteStoryWorker(adaptCandidateWorker(original)));
const transformed = instrumentSentenceBudgetWorker(adapted);
const compiled = (await transformWithOxc(transformed.replaceAll('import.meta.env.VITE_CREATIVE_WRITER_DIAGNOSTICS', '"0"'),
  workerPath)).code.replace(/^import .+;\n/gmu, '');
const header = '<think>\n\n</think>\n\n';
let server, production;
before(async () => {
  server = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true }, logLevel: 'silent' });
  production = Object.assign({}, ...await Promise.all(['/src/narrator/creative-story.ts',
    '/src/narrator/creative-story-sentences.ts', '/src/narrator/creative-continuity.ts',
    '/src/narrator/creative-writer-conversation.ts'].map(path => server.ssrLoadModule(path))));
});
after(async () => { await server?.close(); });

function fakeWorker({ attempts, resetDelays = [], interruptError = false, settlementError = false } = {}) {
  const events = [], replies = [], requests = [], calls = { interrupts: 0, drains: 0, resets: 0, selectors: 0 };
  let clock = 0, handler, requestCount = 0;
  const workerScope = { addEventListener(_type, callback) { handler = callback; }, postMessage(reply) { replies.push(reply); } };
  const bindings = { ...production,
    __tg2SelectSentenceBudgetFallback(...args) { calls.selectors++; return selectSentenceBudgetFallback(...args); },
    __tg2CleanBudgetOutput: production.cleanCreativeStoryOutput,
    __tg2CompletedBudgetSentences: production.completedCreativeStorySentences,
    creativeWriterModelId: 'test-model', self: workerScope,
    createCreativeDirectionMask: () => tensor => tensor,
    performance: { now: () => clock },
    globalThis: { __tg2WriteTiming: { worker() {} }, __tg2CompleteStoryFinish(completed) {
      if (completed && settlementError) throw Error('Original settlement failure');
    } },
    console: { debug(line) {
      for (const prefix of ['TG2_SENTENCE_BUDGET ', 'TG2_CANDIDATE_RAW ']) {
        if (line.startsWith(prefix)) events.push({ prefix, record: JSON.parse(line.slice(prefix.length)) });
      }
    } },
  };
  assert.doesNotMatch(compiled, /^import /mu);
  const controller = new Function(...Object.keys(bindings), compiled + '\nreturn { setModel(value) { model = value; } };')(...Object.values(bindings));
  const model = { async resetChat() { clock += resetDelays[calls.resets++] ?? 0; },
    async interruptGenerate() { calls.interrupts++; if (interruptError) throw Error('Original interrupt failure'); },
    chat: { completions: { async create(request) {
      requests.push(request);
      if (!request.stream) return { choices: [{ message: { content: '1' } }] };
      const attempt = attempts[requestCount++];
      if (attempt instanceof Error) throw attempt;
      return (async function* () {
        try {
          for (const step of attempt) {
            if (step.at !== undefined) clock = step.at;
            if (step.advance !== undefined) clock += step.advance;
            if (step.error) throw Error(step.error);
            yield { choices: [{ delta: { content: step.text ?? '' } }] };
          }
        } finally { calls.drains++; }
      })();
    } } } };
  controller.setModel(model);
  return { calls, events, replies, requests,
    async write(messages = [{ role: 'user', content: 'Current scene.' }], id = 1) { await handler({ data: { type: 'write', id, messages } }); },
    async direct() { await handler({ data: { type: 'direct', id: 10, messages: [{ role: 'user', content: 'Choose.' }] } }); },
    decisions: () => events.filter(e => e.prefix === 'TG2_SENTENCE_BUDGET ').map(e => e.record),
    raw: () => events.filter(e => e.prefix === 'TG2_CANDIDATE_RAW ').map(e => e.record),
  };
}

test('real transformed worker crosses 79999/80000 once, freezes the prefix, and drains late text', async () => {
  const worker = fakeWorker({ attempts: [[
    { at: 79999, text: header + 'Mara steadied Rowan. A' },
    { at: 80000, text: 'nxious' }, { at: 81000, text: ' thoughts lingered.' },
  ]] });
  await worker.write();
  assert.deepEqual(worker.replies, [{ type: 'result', id: 1, text: 'Mara steadied Rowan.' }]);
  assert.equal(worker.calls.interrupts, 1); assert.equal(worker.calls.drains, 1);
  assert.equal(worker.calls.selectors, 2);
  const [decision] = worker.decisions();
  assert.equal(decision.mode, 'completed-sentence-budget-fallback');
  assert.equal(decision.stopElapsedMs, 80000); assert.equal(decision.elapsedMs, 81000);
  assert.equal(decision.sentenceCount, 1);
  assert.equal(worker.raw()[0].raw, header + 'Mara steadied Rowan. Anxious thoughts lingered.');
  assert.ok(decision.originalCharacters > decision.stopOriginalCharacters);
  const output = { status: 'completed', raw: worker.replies[0].text };
  assert.equal(isCompleteSentenceBudgetEvidence(worker.decisions(), output, worker.raw()), true);
  for (const change of [{ selectedPrefix: 'Invented.' }, { stopElapsedMs: 79999 }, { elapsedMs: 90000 },
    { rawTruncated: true }, { discardedCharacters: 0 }, { stopOriginalCharacters: 1 }]) {
    assert.equal(isCompleteSentenceBudgetEvidence([{ ...decision, ...change }], output, worker.raw()), false);
  }
});

test('normal two-sentence and maximum-length stops take priority over the optional selector', async () => {
  const text = 'Mara steadied Rowan. She worried quietly. Another';
  const normal = fakeWorker({ attempts: [[{ at: 80000, text: header + text }, { text: ' thought.' }]] });
  await normal.write();
  assert.equal(normal.calls.selectors, 0); assert.equal(normal.calls.interrupts, 1);
  assert.equal(normal.replies[0].text, text);
  assert.equal(normal.decisions()[0].mode, 'natural-completion');
  assert.equal(normal.decisions()[0].stopElapsedMs, null);
  assert.equal(isCompleteSentenceBudgetEvidence(normal.decisions(), { status: 'completed', raw: text }, normal.raw()), true);
  const oversized = fakeWorker({ attempts: [[{ at: 80000, text: 'a'.repeat(4001) }, { text: 'late' }]] });
  await oversized.write();
  assert.equal(oversized.calls.selectors, 0); assert.equal(oversized.calls.interrupts, 1);
  assert.equal(oversized.calls.drains, 1); assert.equal(oversized.replies[0].type, 'error');
  assert.equal(oversized.raw()[0].raw.length, 4000); assert.equal(oversized.raw()[0].rawTruncated, true);
  assert.deepEqual(oversized.decisions(), []);
});

test('interrupt, stream, settlement, unsafe late text, and raw overflow failures never return the selected prefix', async () => {
  for (const failure of ['interrupt', 'stream', 'settlement', 'unsafe', 'overflow']) {
    const late = failure === 'stream' ? { error: 'Original drain failure' }
      : { text: failure === 'unsafe' ? ' <unsafe>' : failure === 'overflow' ? 'x'.repeat(5000) : ' thoughts lingered.' };
    const worker = fakeWorker({ attempts: [[{ at: 80000, text: header + 'Mara steadied Rowan. Anxious' }, late]],
      interruptError: failure === 'interrupt', settlementError: failure === 'settlement' });
    await worker.write();
    assert.deepEqual(worker.replies, [{ type: 'error', id: 1 }], failure);
    assert.equal(worker.calls.interrupts, 1, failure); assert.equal(worker.calls.drains, 1, failure);
    assert.deepEqual(worker.decisions(), [], failure);
    if (failure === 'overflow') { assert.equal(worker.raw()[0].raw.length, 4000); assert.equal(worker.raw()[0].rawTruncated, true); }
  }
});

test('one write clock survives reset/overflow retry while the next write starts a fresh budget', async () => {
  const overflow = Error('Context does not fit'); overflow.name = 'ContextWindowSizeExceededError';
  const worker = fakeWorker({ resetDelays: [50000, 30000, 0], attempts: [overflow,
    [{ text: header + 'Mara steadied Rowan. Anxious' }, { advance: 100, text: ' thoughts lingered.' }],
    [{ text: header + 'Mara steadied Rowan. Anxious' }]] });
  const messages = [{ role: 'system', content: 'Story instructions.' },
    { role: 'user', content: production.creativeStoryMemoryPrefix + '"Earlier prose."' },
    { role: 'user', content: 'Current scene.' }];
  await worker.write(messages);
  assert.equal(worker.calls.resets, 2); assert.equal(worker.decisions()[0].stopElapsedMs, 80000);
  assert.equal(worker.replies[0].type, 'result');
  await worker.write(undefined, 2);
  assert.equal(worker.decisions()[1].mode, 'natural-completion');
  assert.equal(worker.decisions()[1].elapsedMs, 0);
  assert.equal(worker.calls.interrupts, 1);
});

test('direct path, natural completion before budget, source guards, and observer failure remain unchanged', async () => {
  const worker = fakeWorker({ attempts: [[{ at: 79999, text: header + 'Mara steadied Rowan. Anxious' }]] });
  await worker.write(); await worker.direct();
  assert.equal(worker.decisions()[0].mode, 'natural-completion'); assert.equal(worker.calls.interrupts, 0);
  assert.equal(worker.decisions().length, 1);
  assert.equal(worker.requests.at(-1).stream, false); assert.equal(worker.requests.at(-1).max_tokens, 1);
  for (const marker of ['stream: true, max_tokens: 68, temperature: 0.7, top_p: 0.85, seed: 7',
    'await model.interruptGenerate();', 'for await (const chunk of chunks)', 'if (interruptionError !== null) throw interruptionError;']) {
    assert.equal(transformed.split(marker).length, adapted.split(marker).length, marker);
  }
  assert.equal(transformed.includes('setTimeout('), false);
  assert.ok(transformed.indexOf('const __tg2SentenceBudgetStarted = performance.now();') < transformed.indexOf('while (true) {'));
  assert.equal(sentenceBudgetPlugin(process.cwd()).transform(adapted, workerPath + '?worker_file').code, transformed);
  assert.equal(sentenceBudgetPlugin(process.cwd()).transform(adapted, workerPath + '.backup'), null);
  assert.throws(() => instrumentSentenceBudgetWorker(original), /timed candidate/u);
  assert.throws(() => instrumentSentenceBudgetWorker(transformed), /exactly once/u);
  assert.throws(() => instrumentSentenceBudgetWorker(adapted + '__tg2ArrivalGrammarRequest'), /without grammar/u);
  assert.throws(() => instrumentSentenceBudgetWorker(adapted.replace('let boundedMessages = messages;', 'CHANGED')), /no longer matches/u);
  const circular = {}; circular.self = circular;
  assert.doesNotThrow(() => emitSentenceBudgetDecision(circular));
  assert.doesNotThrow(() => emitSentenceBudgetDecision({}, () => { throw Error('Observer failure'); }));
  assert.equal(readFileSync(workerPath, 'utf8'), original);
});
