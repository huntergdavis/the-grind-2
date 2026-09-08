import { resolve } from 'node:path';

export function compareTransferBytes(expected, actual) {
  let mismatchedBytes = 0, firstDifferenceByte = null;
  const length = Math.max(expected.byteLength, actual.byteLength);
  for (let index = 0; index < length; index++) {
    if (expected[index] !== actual[index]) {
      mismatchedBytes++;
      if (firstDifferenceByte === null) firstDifferenceByte = index;
    }
  }
  return { matches: mismatchedBytes === 0, expectedBytes: expected.byteLength,
    actualBytes: actual.byteLength, mismatchedBytes, firstDifferenceByte,
    firstDifferenceElement: firstDifferenceByte === null ? null : Math.floor(firstDifferenceByte / 4),
    expectedByte: firstDifferenceByte === null ? null : expected[firstDifferenceByte] ?? null,
    actualByte: firstDifferenceByte === null ? null : actual[firstDifferenceByte] ?? null };
}

/** Known data only; never invokes model forward passes, sampling, or RNG. */
export async function runTransferDiagnostics(pipeline,
  emit = record => console.debug('TG2_TRANSFER_DIAGNOSTIC ' + JSON.stringify(record))) {
  const started = performance.now();
  const report = { kind: 'known-tensor-transfers', generatedTokens: 0, cases: [],
    ok: false, error: null, cleanupErrors: [], elapsedMs: 0 };
  let failure = null;
  try {
    if (!pipeline?.tvm || !pipeline?.device) throw new Error('Loaded candidate pipeline is unavailable');
    const { tvm, device } = pipeline;
    for (const [dtype, length] of [['float32', 64], ['float32', 151936], ['int32', 1]]) {
      const began = performance.now();
      const pattern = dtype === 'int32' ? new Int32Array([42])
        : Float32Array.from({ length }, (_, index) => ((index % 257) - 128) / 8);
      const expected = new Uint8Array(pattern.buffer, pattern.byteOffset, pattern.byteLength);
      const entry = { dtype, length, bytes: expected.byteLength, observations: [],
        tensorsAllocated: 0, tensorsDisposed: 0, synchronizedBeforeDispose: false, elapsedMs: 0 };
      report.cases.push(entry);
      const owned = [];
      const allocate = target => {
        const tensor = tvm.detachFromCurrentScope(tvm.empty([length], dtype, target));
        owned.push(tensor);
        entry.tensorsAllocated++;
        return tensor;
      };
      const observe = (path, tensor) => {
        const direct = tvm.memory.loadRawBytes(tensor.getCPUDataAddress(), tensor.numStorageBytes());
        const array = tensor.toArray();
        const arrayBytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        entry.observations.push({ path, direct: compareTransferBytes(expected, direct),
          toArray: compareTransferBytes(expected, arrayBytes),
          directVsToArray: compareTransferBytes(direct, arrayBytes) });
      };
      tvm.beginScope();
      try {
        const cpu = allocate(tvm.cpu()).copyFrom(pattern);
        observe('js-to-cpu', cpu);
        const gpu = allocate(device).copyFrom(cpu);
        const returnedCPU = allocate(tvm.cpu()).copyFrom(gpu);
        await device.sync();
        observe('cpu-to-gpu-to-cpu', returnedCPU);
        const jsGPU = allocate(device).copyFrom(pattern);
        const jsReturnedCPU = allocate(tvm.cpu()).copyFrom(jsGPU);
        await device.sync();
        observe('js-to-gpu-to-cpu', jsReturnedCPU);
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
      entry.observations.length === 3 && entry.observations.every(observation =>
        observation.direct.matches && observation.toArray.matches && observation.directVsToArray.matches));
  } catch (error) {
    failure = error;
    report.error = String(error).slice(0, 600);
  }
  report.elapsedMs = Math.round(performance.now() - started);
  emit(report);
  // Operational errors reach the caller after the single report and owned cleanup.
  // Numerical mismatches remain evidence in the report, not a substitute sampler.
  if (failure) throw failure;
  if (report.cleanupErrors.length) throw new Error('Transfer diagnostic cleanup failed');
  return report;
}

/** Must follow the existing candidate adapter in this manual build only. */
export function transferDiagnosticPlugin(repo) {
  const worker = resolve(repo, 'src/narrator/creative-writer.worker.ts');
  const marker = 'await candidate.reload(creativeWriterModelId, { context_window_size: 1024 });';
  return {
    name: 'tg2-isolated-transfer-diagnostic', enforce: 'pre',
    transform(source, id) {
      if (id.split('?')[0] !== worker) return null;
      if (source.includes('runTransferDiagnostics') || source.split(marker).length - 1 !== 1) {
        throw new Error('Transfer diagnostic source no longer matches');
      }
      const prefix = `const compareTransferBytes = ${compareTransferBytes.toString()};\nconst runTransferDiagnostics = ${runTransferDiagnostics.toString()};\n`;
      return { code: prefix + source.replace(marker, marker
        + '\n    await runTransferDiagnostics(candidate.loadedModelIdToPipeline.get(creativeWriterModelId));'), map: null };
    },
  };
}
