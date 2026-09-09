import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseWebgpuV1Arguments } from './run-webgpu-v1.mjs';
import {
  creativeWriterModelId, creativeWriterModelRevision, creativeWriterModelUrl,
  creativeWriterModelLib, creativeWriterModelShardFiles, webgpuCandidate,
} from './webgpu-candidate-config.mjs';
import { adaptCandidateWorker, candidateModelPlugin, stripEmptyThinkingHeader } from './webgpu-candidate-adapter.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workerPath = resolve(repo, 'src/narrator/creative-writer.worker.ts');
const workerSource = readFileSync(workerPath, 'utf8');
const emptyHeader = '<think>\n\n</think>\n\n';

test('candidate mode requires one explicit network choice and retains the selected policy', () => {
  for (const [flag, cacheOnly] of [['--allow-model-download', false], ['--cache-only', true]]) {
    assert.deepEqual(parseWebgpuV1Arguments(['--run', '--candidate-scenes', flag]), {
      productionScenes: true, productionSolo: false, replayFarewell: false, replaySequence: false,
      replay: false, productionMode: true, candidateScenes: true, candidateDiagnostic: false, candidateTransferCheck: false, candidateComputeCheck: false, observePreSort: false, cacheOnly,
    });
  }
});

test('invalid, ambiguous, duplicate, and unscoped network flags fail before execution', () => {
  const invalid = [
    [], ['--candidate-scenes', '--cache-only'], ['--run', '--candidate-scenes'],
    ['--run', '--candidate-scenes', '--allow-model-download', '--cache-only'],
    ['--run', '--candidate-scenes', '--cache-only', '--cache-only'], ['--run', '--run'],
    ['--run', '--allow-model-download'], ['--run', '--cache-only'],
    ['--run', '--production-scenes', '--allow-model-download'], ['--run', '--production-solo', '--cache-only'],
    ['--run', '--candidate-scenes', '--cache-only', '--unknown'],
    ['--run', '--production-scenes', '--production-solo'],
    ...['--production-scenes', '--production-solo', '--replay-farewell', '--replay-sequence']
      .map(mode => ['--run', '--candidate-scenes', '--cache-only', mode]),
  ];
  for (const args of invalid) assert.throws(() => parseWebgpuV1Arguments(args), /Usage:/, JSON.stringify(args));
});

test('all existing exploratory, production, and exact-replay modes retain their defaults', () => {
  const modes = [undefined, '--production-scenes', '--production-solo', '--replay-farewell', '--replay-sequence'];
  for (const mode of modes) {
    const replay = mode === '--replay-farewell' || mode === '--replay-sequence';
    assert.deepEqual(parseWebgpuV1Arguments(mode ? ['--run', mode] : ['--run']), {
      productionScenes: mode === '--production-scenes', productionSolo: mode === '--production-solo',
      replayFarewell: mode === '--replay-farewell', replaySequence: mode === '--replay-sequence',
      replay, productionMode: mode !== undefined, candidateScenes: false, candidateDiagnostic: false, candidateTransferCheck: false, candidateComputeCheck: false, observePreSort: false, cacheOnly: mode !== undefined,
    });
  }
});

test('candidate sampling diagnostic is an explicit cache-only mode, never a download or scene-chain run', () => {
  assert.deepEqual(parseWebgpuV1Arguments(['--run', '--candidate-diagnostic', '--cache-only']), {
    productionScenes: true, productionSolo: false, replayFarewell: false, replaySequence: false,
    replay: false, productionMode: true, candidateScenes: true, candidateDiagnostic: true, candidateTransferCheck: false, candidateComputeCheck: false, observePreSort: false, cacheOnly: true,
  });
  for (const args of [
    ['--run', '--candidate-diagnostic'], ['--candidate-diagnostic', '--cache-only'],
    ['--run', '--candidate-diagnostic', '--allow-model-download'],
    ['--run', '--candidate-diagnostic', '--cache-only', '--allow-model-download'],
    ...['--candidate-scenes', '--production-scenes', '--production-solo', '--replay-farewell', '--replay-sequence']
      .map(mode => ['--run', '--candidate-diagnostic', '--cache-only', mode]),
  ]) assert.throws(() => parseWebgpuV1Arguments(args), /Usage:/);
});

test('diagnostic orchestration takes one recorded request, retains its source, and never archives it', () => {
  const receiptName = 'webgpu-candidate-report-2026-09-08T22-39-25-104Z-700078b2.json';
  const receipt = JSON.parse(readFileSync(new URL(receiptName, import.meta.url), 'utf8'));
  assert.equal(receipt.outputs.length, 1);
  assert.equal(receipt.outputs[0].id, 'injured-companion-on-the-road');
  assert.equal(receipt.outputs[0].continuity.length, 0);
  assert.deepEqual(receipt.outputs[0].messages, receipt.inputs[0].messages);
  const runner = readFileSync(new URL('./run-webgpu-v1.mjs', import.meta.url), 'utf8');
  const probe = readFileSync(new URL('./webgpu-v1-probe.js', import.meta.url), 'utf8');
  assert.ok(runner.includes('const plannedScenes = candidateTransferCheck || candidateComputeCheck ? 0 : candidateDiagnostic ? 1 :'));
  assert.ok(runner.includes('const totalDeadlineMs = candidateTransferCheck || candidateComputeCheck ? 300_000 : candidateDiagnostic ? 600_000 :'));
  assert.ok(runner.includes('const singleScene = productionSolo || replayFarewell || candidateDiagnostic;'));
  assert.ok(probe.includes('candidateDiagnostic ? failedCandidate.outputs.slice(0, 1)'));
  assert.ok(probe.includes('if (replay || candidateDiagnostic)'));
  assert.ok(probe.includes('!replay && !candidateDiagnostic && acceptedNewStory && journal.record'));
});

test('transfer-only mode is offline, mutually exclusive, and exits before scene preparation', () => {
  assert.deepEqual(parseWebgpuV1Arguments(['--run', '--candidate-transfer-check', '--cache-only']), {
    productionScenes: true, productionSolo: false, replayFarewell: false, replaySequence: false,
    replay: false, productionMode: true, candidateScenes: true, candidateDiagnostic: false, candidateTransferCheck: true, candidateComputeCheck: false, observePreSort: false, cacheOnly: true,
  });
  for (const args of [
    ['--run', '--candidate-transfer-check'], ['--candidate-transfer-check', '--cache-only'],
    ['--run', '--candidate-transfer-check', '--allow-model-download'],
    ...['--candidate-scenes', '--candidate-diagnostic', '--production-scenes', '--production-solo', '--replay-farewell', '--replay-sequence', '--allow-model-download']
      .map(mode => ['--run', '--candidate-transfer-check', '--cache-only', mode]),
  ]) assert.throws(() => parseWebgpuV1Arguments(args), /Usage:/);
  const runner = readFileSync(new URL('./run-webgpu-v1.mjs', import.meta.url), 'utf8');
  assert.ok(runner.includes("report.phase = 'closed-after-transfer-check';\n      return;"));
  assert.ok(runner.indexOf("report.phase = 'closed-after-transfer-check'") < runner.indexOf('globalThis.webgpuV1Probe.prepare(value)'));
});

test('compute-only mode is cache-only, mutually exclusive, and cannot enter the scene loop', () => {
  assert.deepEqual(parseWebgpuV1Arguments(['--run', '--candidate-compute-check', '--cache-only']), {
    productionScenes: true, productionSolo: false, replayFarewell: false, replaySequence: false,
    replay: false, productionMode: true, candidateScenes: true, candidateDiagnostic: false,
    candidateTransferCheck: false, candidateComputeCheck: true, observePreSort: false, cacheOnly: true,
  });
  for (const args of [
    ['--run', '--candidate-compute-check'], ['--candidate-compute-check', '--cache-only'],
    ['--run', '--candidate-compute-check', '--allow-model-download'],
    ...['--candidate-scenes', '--candidate-diagnostic', '--candidate-transfer-check', '--production-scenes',
      '--production-solo', '--replay-farewell', '--replay-sequence', '--allow-model-download', '--candidate-compute-check']
      .map(mode => ['--run', '--candidate-compute-check', '--cache-only', mode]),
  ]) assert.throws(() => parseWebgpuV1Arguments(args), /Usage:/);
  const runner = readFileSync(new URL('./run-webgpu-v1.mjs', import.meta.url), 'utf8');
  assert.ok(runner.includes("report.phase = 'closed-after-compute-check';\n      return;"));
  assert.ok(runner.indexOf("report.phase = 'closed-after-compute-check'") < runner.indexOf('globalThis.webgpuV1Probe.prepare(value)'));
});

test('pre-sort observation is available only in the one-request cache-only sampling diagnostic', () => {
  assert.equal(parseWebgpuV1Arguments(['--run', '--candidate-diagnostic', '--cache-only', '--observe-pre-sort']).observePreSort, true);
  for (const mode of [[], ['--candidate-scenes', '--cache-only'], ['--candidate-transfer-check', '--cache-only'],
    ['--candidate-compute-check', '--cache-only'], ['--production-scenes'], ['--replay-sequence']]) {
    assert.throws(() => parseWebgpuV1Arguments(['--run', ...mode, '--observe-pre-sort']), /Usage:/);
  }
});

test('candidate manifest pins one supported Qwen3 model within the explicit artifact budget', () => {
  assert.equal(creativeWriterModelId, 'Qwen3-4B-q4f16_1-MLC');
  assert.equal(creativeWriterModelRevision, 'a5c9fab855e3ccbdfed2e7e69683d75f30332161');
  assert.equal(creativeWriterModelUrl,
    'https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC/resolve/a5c9fab855e3ccbdfed2e7e69683d75f30332161/');
  assert.equal(creativeWriterModelLib,
    'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/025bcaf3780fa8254f5e5efd3bfea0a5397248f4/web-llm-models/v0_2_84/base/Qwen3-4B-q4f16_1_cs1k-webgpu.wasm');
  assert.deepEqual(creativeWriterModelShardFiles, Array.from({ length: 74 }, (_, i) => `params_shard_${i}.bin`));
  assert.equal(Object.isFrozen(creativeWriterModelShardFiles), true);
  assert.equal(Object.isFrozen(webgpuCandidate), true);
  assert.equal(webgpuCandidate.runtimePackage, '@mlc-ai/web-llm');
  assert.equal(webgpuCandidate.runtimeVersion, '0.2.85');
  assert.equal(webgpuCandidate.weightBytes, 2_262_920_192);
  assert.equal(webgpuCandidate.artifactBytes, 2_280_372_422);
  assert.equal(webgpuCandidate.maximumArtifactBytes, 2_500_000_000);
  assert.ok(webgpuCandidate.artifactBytes <= webgpuCandidate.maximumArtifactBytes);
  assert.equal(webgpuCandidate.contextWindow, 1024);
  assert.equal(webgpuCandidate.maxTokens, 64);
  assert.equal(webgpuCandidate.rawMaxTokens, 68);
  assert.deepEqual(webgpuCandidate.emptyThinkingHeaderTokenIds, [151667, 271, 151668, 271]);
  assert.equal(Object.isFrozen(webgpuCandidate.emptyThinkingHeaderTokenIds), true);
  assert.equal(webgpuCandidate.rawMaxTokens,
    webgpuCandidate.maxTokens + webgpuCandidate.emptyThinkingHeaderTokenIds.length);
  assert.equal(webgpuCandidate.enableThinking, false);
  assert.equal(webgpuCandidate.license, 'Apache-2.0');
});

test('only the exact leading synthetic empty thinking header is removed', () => {
  const prose = 'Mara steadied Rowan. Her relief could not quiet her worry.';
  assert.equal(stripEmptyThinkingHeader(emptyHeader + prose), prose);
  assert.equal(stripEmptyThinkingHeader(emptyHeader), '');
  assert.equal(stripEmptyThinkingHeader(emptyHeader + emptyHeader + prose), emptyHeader + prose);
  for (const text of [prose, '', ' ' + emptyHeader + prose, '\n' + emptyHeader + prose,
    '<think>real reasoning</think>\n\n' + prose, '<think>\n</think>\n\n' + prose,
    '<think>\n\n</think>\n', '<think>\n\n', prose + emptyHeader]) {
    assert.equal(stripEmptyThinkingHeader(text), text);
  }
});

test('candidate adapter transforms the real worker without replacing its lifecycle or admission contracts', () => {
  const adapted = adaptCandidateWorker(workerSource);
  assert.equal(adapted.split('extra_body: { enable_thinking: false }').length - 1, 2);
  assert.ok(adapted.includes('hasFinishedCreativeStoryPassage(stripEmptyThinkingHeader(text))'));
  assert.ok(adapted.includes('const result = stripEmptyThinkingHeader(text).trim();'));
  assert.ok(adapted.includes('stripEmptyThinkingHeader(result.choices[0]?.message.content ?? "").trim() === label'));
  assert.ok(adapted.includes('TG2_CANDIDATE_RAW '));
  assert.ok(adapted.includes('stream: true, max_tokens: 68,'));
  assert.equal(adapted.includes('stream: true, max_tokens: 64,'), false);
  assert.ok(adapted.includes('stream: false, max_tokens: 1,'));
  for (const unchanged of ['await model.resetChat(false, creativeWriterModelId);',
    'await model.interruptGenerate();', 'for await (const chunk of chunks)',
    'buildCreativeWriterConversation(boundedMessages)', 'sampledTokens.length !== 1',
    'createCreativeDirectionMask(labels.map((label) => directionTokens[label]))']) {
    assert.ok(adapted.includes(unchanged), unchanged);
  }
  assert.equal(readFileSync(workerPath, 'utf8'), workerSource);
});

test('candidate adapter fails closed if any required source marker is missing or duplicated', () => {
  for (const marker of ['model.chat.completions.create({ model: creativeWriterModelId,',
    'hasFinishedCreativeStoryPassage(text)', 'const result = text.trim();',
    'result.choices[0]?.message.content === label', 'stream: true, max_tokens: 64,']) {
    assert.throws(() => adaptCandidateWorker(workerSource.replace(marker, 'CHANGED_SOURCE_MARKER')), /no longer matches/);
    assert.throws(() => adaptCandidateWorker(workerSource + '\n' + marker), /no longer matches/);
  }
});

test('manual-build plugin substitutes only the exact model manifest and transforms only the real worker', () => {
  const plugin = candidateModelPlugin(repo);
  const manifest = resolve(repo, 'tools/creative-story-probe/webgpu-candidate-config.mjs');
  for (const source of ['./creative-writer-model', './creative-writer-model.ts']) {
    assert.equal(plugin.resolveId(source, workerPath), manifest);
    assert.equal(plugin.resolveId(source, workerPath + '?worker_file&type=module'), manifest);
  }
  for (const source of ['./creative-writer-model-extra', './creative-writer-client',
    './nested/creative-writer-model', '@mlc-ai/web-llm', resolve(repo, 'src/narrator/creative-writer-model.ts')]) {
    assert.equal(plugin.resolveId(source, workerPath), null, source);
  }
  assert.equal(plugin.resolveId('./creative-writer-model', undefined), null);
  assert.equal(plugin.resolveId('./creative-writer-model', resolve(repo, 'src/ui/unrelated.ts')), null);
  for (const id of [workerPath, workerPath + '?worker_file&type=module']) {
    assert.deepEqual(plugin.transform(workerSource, id), { code: adaptCandidateWorker(workerSource), map: null });
  }
  for (const id of [workerPath + '.backup', resolve(repo, 'src/ui/creative-writer.worker.ts'), manifest]) {
    assert.equal(plugin.transform(workerSource, id), null, id);
  }
});
