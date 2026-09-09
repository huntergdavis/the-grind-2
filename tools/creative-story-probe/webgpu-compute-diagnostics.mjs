import { resolve } from 'node:path';
import { compareTransferBytes } from './webgpu-transfer-diagnostics.mjs';

export function stableSoftmaxReference(logits, temperature) {
  if (!(temperature > 0) || !Number.isFinite(temperature) || logits.length === 0) throw new Error('Invalid reference input');
  let maximum = -Infinity;
  for (const value of logits) {
    if (!Number.isFinite(value)) throw new Error('Reference logits must be finite');
    maximum = Math.max(maximum, value);
  }
  const probabilities = new Float64Array(logits.length);
  let sum = 0;
  for (let index = 0; index < logits.length; index++) {
    probabilities[index] = Math.exp((logits[index] - maximum) / temperature);
    sum += probabilities[index];
  }
  for (let index = 0; index < probabilities.length; index++) probabilities[index] /= sum;
  return probabilities;
}

export function compareSoftmaxOutput(actual, expected) {
  const encode = value => value === undefined ? null : Number.isFinite(value) ? value
    : Number.isNaN(value) ? 'NaN' : value > 0 ? '+Infinity' : '-Infinity';
  let nanCount = 0, positiveInfinityCount = 0, negativeInfinityCount = 0;
  let negativeCount = 0, aboveOneCount = 0, nonzeroCount = 0, sum = 0;
  let actualArgmax = null, maximum = -Infinity, expectedArgmax = 0, maxAbsoluteError = 0, l1Error = 0;
  for (let index = 0; index < expected.length; index++) if (expected[index] > expected[expectedArgmax]) expectedArgmax = index;
  for (let index = 0; index < actual.length; index++) {
    const value = actual[index];
    if (Number.isNaN(value)) nanCount++;
    else if (value === Infinity) positiveInfinityCount++;
    else if (value === -Infinity) negativeInfinityCount++;
    if (!Number.isNaN(value) && (actualArgmax === null || value > maximum)) { maximum = value; actualArgmax = index; }
    if (value < 0) negativeCount++;
    if (value > 1) aboveOneCount++;
    if (value !== 0) nonzeroCount++;
    sum += value;
    const error = Math.abs(value - expected[index]);
    maxAbsoluteError = Math.max(maxAbsoluteError, error);
    l1Error += error;
  }
  const allFinite = nanCount + positiveInfinityCount + negativeInfinityCount === 0;
  const sameLength = actual.length === expected.length;
  const normalizationError = allFinite ? Math.abs(sum - 1) : null;
  const normalized = sameLength && allFinite && negativeCount === 0 && aboveOneCount === 0 && normalizationError <= 1e-3;
  const comparable = sameLength && allFinite;
  const argmaxMatchesReference = actualArgmax !== null && expected[actualArgmax] === expected[expectedArgmax];
  const exampleIndices = [...new Set([...Array.from({ length: Math.min(8, expected.length) }, (_, i) => i), expectedArgmax,
    ...(actualArgmax === null ? [] : [actualArgmax])])];
  return { length: actual.length, expectedLength: expected.length, nanCount, positiveInfinityCount, negativeInfinityCount,
    negativeCount, aboveOneCount, nonzeroCount, sum: allFinite ? sum : null, normalizationError, normalized,
    maxAbsoluteError: comparable ? maxAbsoluteError : null, l1Error: comparable ? l1Error : null,
    expectedArgmax, actualArgmax, argmaxMatchesReference, expectedProbabilityAtReferenceArgmax: expected[expectedArgmax],
    actualProbabilityAtReferenceArgmax: encode(actual[expectedArgmax]),
    tolerance: { normalization: 1e-3, maxAbsoluteError: 1e-5, l1Error: 2e-3 },
    matchesReference: normalized && maxAbsoluteError <= 1e-5 && l1Error <= 2e-3 && argmaxMatchesReference,
    examples: exampleIndices.map(index => ({ index, expected: expected[index], actual: encode(actual[index]) })) };
}

/** Calls only the loaded softmax function on owned synthetic tensors; never a model or sampler. */
export async function runComputeDiagnostics(pipeline,
  emit = record => console.debug('TG2_COMPUTE_DIAGNOSTIC ' + JSON.stringify(record))) {
  const started = performance.now();
  const report = { kind: 'known-logit-softmax', generatedTokens: 0, cases: [], ok: false,
    error: null, cleanupErrors: [], elapsedMs: 0 };
  let failure = null;
  try {
    if (!pipeline?.tvm || !pipeline?.device || typeof pipeline.fsoftmaxWithTemperature !== 'function'
      || pipeline.fullVocabSize !== 151936) throw new Error('Expected the loaded 151936-token candidate softmax pipeline');
    const { tvm, device, fullVocabSize } = pipeline;
    for (const name of ['zero', 'nonuniform-interior-maximum']) {
      const began = performance.now();
      const logits = name === 'zero' ? new Float32Array(fullVocabSize)
        : Float32Array.from({ length: fullVocabSize }, (_, index) => ((index % 257) - 128) / 32);
      if (name !== 'zero') logits[73777] = 8;
      const temperatures = new Float32Array([0.7]);
      const reference = stableSoftmaxReference(logits, temperatures[0]);
      const entry = { name, length: fullVocabSize, inputShape: [1, 1, fullVocabSize], requestedTemperature: 0.7,
        effectiveFloat32Temperature: temperatures[0], roundtrips: [], probabilities: null, directProbabilities: null,
        directVsToArray: null, tensorsAllocated: 0, tensorsDisposed: 0, synchronizedBeforeDispose: false, elapsedMs: 0 };
      report.cases.push(entry);
      const owned = [];
      const own = tensor => { tvm.detachFromCurrentScope(tensor); owned.push(tensor); entry.tensorsAllocated++; return tensor; };
      const allocate = (shape, target) => own(tvm.empty(shape, 'float32', target));
      const read = tensor => {
        const direct = tvm.memory.loadRawBytes(tensor.getCPUDataAddress(), tensor.numStorageBytes());
        const array = tensor.toArray();
        const arrayBytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        return { direct, array, arrayBytes };
      };
      const roundtrip = (path, tensor, expected) => {
        const { direct, arrayBytes } = read(tensor);
        const expectedBytes = new Uint8Array(expected.buffer, expected.byteOffset, expected.byteLength);
        entry.roundtrips.push({ path, direct: compareTransferBytes(expectedBytes, direct),
          toArray: compareTransferBytes(expectedBytes, arrayBytes), directVsToArray: compareTransferBytes(direct, arrayBytes) });
      };
      tvm.beginScope();
      try {
        const input = allocate(entry.inputShape, device).copyFrom(logits);
        const temperature = allocate([1], device).copyFrom(temperatures);
        const inputCPU = allocate(entry.inputShape, tvm.cpu()).copyFrom(input);
        const temperatureCPU = allocate([1], tvm.cpu()).copyFrom(temperature);
        await device.sync();
        roundtrip('logits-js-gpu-cpu', inputCPU, logits);
        roundtrip('temperature-js-gpu-cpu', temperatureCPU, temperatures);
        const probabilities = own(pipeline.fsoftmaxWithTemperature(input, temperature));
        const probabilitiesCPU = allocate(probabilities.shape, tvm.cpu()).copyFrom(probabilities);
        await device.sync();
        const { direct, array, arrayBytes } = read(probabilitiesCPU);
        entry.probabilities = compareSoftmaxOutput(array, reference);
        entry.directProbabilities = compareSoftmaxOutput(new Float32Array(direct.buffer, direct.byteOffset, direct.byteLength / 4), reference);
        entry.directVsToArray = compareTransferBytes(direct, arrayBytes);
      } finally {
        try { await device.sync(); entry.synchronizedBeforeDispose = true; }
        catch (error) { report.cleanupErrors.push(String(error).slice(0, 300)); }
        for (const tensor of owned.reverse()) {
          try { tensor.dispose(); entry.tensorsDisposed++; }
          catch (error) { report.cleanupErrors.push(String(error).slice(0, 300)); }
        }
        try { tvm.endScope(); }
        catch (error) { report.cleanupErrors.push(String(error).slice(0, 300)); }
        entry.elapsedMs = Math.round(performance.now() - began);
      }
    }
    report.ok = report.cleanupErrors.length === 0 && report.cases.every(entry =>
      entry.roundtrips.every(value => value.direct.matches && value.toArray.matches && value.directVsToArray.matches)
      && entry.probabilities.matchesReference && entry.directProbabilities.matchesReference && entry.directVsToArray.matches);
  } catch (error) { failure = error; report.error = String(error).slice(0, 600); }
  report.elapsedMs = Math.round(performance.now() - started);
  emit(report);
  if (failure) throw failure;
  if (report.cleanupErrors.length) throw new Error('Compute diagnostic cleanup failed');
  return report;
}

export function computeDiagnosticPlugin(repo) {
  const worker = resolve(repo, 'src/narrator/creative-writer.worker.ts');
  const marker = 'await candidate.reload(creativeWriterModelId, { context_window_size: 1024 });';
  return { name: 'tg2-isolated-compute-diagnostic', enforce: 'pre',
    transform(source, id) {
      if (id.split('?')[0] !== worker) return null;
      if (source.includes('runComputeDiagnostics') || source.split(marker).length - 1 !== 1) throw new Error('Compute diagnostic source no longer matches');
      const prefix = `const compareTransferBytes = ${compareTransferBytes.toString()};\nconst stableSoftmaxReference = ${stableSoftmaxReference.toString()};\nconst compareSoftmaxOutput = ${compareSoftmaxOutput.toString()};\nconst runComputeDiagnostics = ${runComputeDiagnostics.toString()};\n`;
      return { code: prefix + source.replace(marker, marker
        + '\n    await runComputeDiagnostics(candidate.loadedModelIdToPipeline.get(creativeWriterModelId));'), map: null };
    } };
}
