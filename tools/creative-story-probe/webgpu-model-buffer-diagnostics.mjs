import { compareTransferBytes } from './webgpu-transfer-diagnostics.mjs';
import { stableSoftmaxReference, compareSoftmaxOutput } from './webgpu-compute-diagnostics.mjs';

/** One comparison only. Additional allocations/readbacks can change timing and later output. */
export function createModelBufferDiagnostics(emit = record => console.debug('TG2_MODEL_BUFFER_DIAGNOSTIC ' + JSON.stringify(record)),
  { allowGrammarMask = false } = {}) {
  let attempted = false, state = null;
  const message = error => ({ name: String(error?.name ?? 'Error'), message: String(error?.message ?? error).slice(0, 600) });
  const bytes = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  const active = pipeline => state !== null && state.pipeline === pipeline;
  const own = tensor => {
    state.pipeline.tvm.detachFromCurrentScope(tensor);
    state.owned.push(tensor);
    state.report.cleanup.tensorsAllocated++;
    return tensor;
  };
  const metadata = tensor => {
    const buffer = state.context.gpuBufferFromPtr(tensor.getDataPtr());
    const logicalBytes = tensor.numStorageBytes(), byteOffset = tensor.byteOffset;
    return { shape: [...tensor.shape], dtype: tensor.dtype, byteOffset, logicalBytes,
      backingBytes: buffer.size, usage: buffer.usage,
      fitsBackingBuffer: Number.isSafeInteger(byteOffset) && byteOffset >= 0
        && Number.isSafeInteger(logicalBytes) && byteOffset + logicalBytes <= buffer.size };
  };
  const read = tensor => {
    const direct = state.pipeline.tvm.memory.loadRawBytes(tensor.getCPUDataAddress(), tensor.numStorageBytes());
    const array = tensor.toArray();
    return { array, direct: new Float32Array(direct.buffer, direct.byteOffset, direct.byteLength / 4),
      directVsToArray: compareTransferBytes(direct, bytes(array)) };
  };
  const close = async error => {
    if (state === null) return;
    const current = state, { report, pipeline } = current;
    if (error) report.error = message(error);
    try { await pipeline.device.sync(); report.cleanup.synchronized = true; }
    catch (failure) { report.cleanup.errors.push(message(failure)); }
    for (const tensor of current.owned.reverse()) {
      try { tensor.dispose(); report.cleanup.tensorsDisposed++; }
      catch (failure) { report.cleanup.errors.push(message(failure)); }
    }
    if (current.scope) {
      try { pipeline.tvm.endScope(); } catch (failure) { report.cleanup.errors.push(message(failure)); }
    }
    if (current.validationScope) {
      try {
        const validationError = await current.gpu.popErrorScope();
        report.gpuErrors.validation = validationError === null ? null : message(validationError);
      } catch (failure) { report.cleanup.errors.push(message(failure)); }
    }
    if (current.listener) {
      try { current.gpu.removeEventListener('uncapturederror', current.listener); report.cleanup.listenerRemoved = true; }
      catch (failure) { report.cleanup.errors.push(message(failure)); }
    }
    report.elapsedMs = Math.round(performance.now() - current.started);
    report.ok = report.comparisonCompleted && report.error === null && report.cleanup.errors.length === 0
      && report.gpuErrors.validation === null && report.gpuErrors.uncaptured.length === 0
      && report.live.matchesReference && report.fresh.matchesReference
      && report.liveDirect.matchesReference && report.freshDirect.matchesReference
      && report.liveDirectVsToArray.matches && report.freshDirectVsToArray.matches
      && report.inputRoundtrip.direct.matches && report.inputRoundtrip.toArray.matches
      && report.temperatureRoundtrip.direct.matches && report.temperatureRoundtrip.toArray.matches
      && Object.values(report.buffers).every(value => value.fitsBackingBuffer);
    state = null;
    emit(report);
    if (error) throw error;
    if (report.cleanup.errors.length) throw new Error('Model-buffer diagnostic cleanup failed');
    return report;
  };
  return {
    async begin(pipeline, genConfig) {
      if (attempted || genConfig?.enable_thinking !== false || genConfig.max_tokens !== 68) return false;
      attempted = true;
      state = { pipeline, started: performance.now(), owned: [], scope: false, validationScope: false,
        listener: null, report: { kind: 'first-live-versus-owned-softmax', firstTokenOnly: true,
          comparisonCompleted: false, replacesOriginalSample: false, timingAndAllocationMayChange: true,
          buffers: {}, gpuErrors: { validation: null, uncaptured: [] }, error: null, ok: false,
          cleanup: { tensorsAllocated: 0, tensorsDisposed: 0, synchronized: false, listenerRemoved: false, errors: [] } } };
      try {
        const context = pipeline.tvm?.lib?.webGPUContext, gpu = context?.device;
        if (!context || !gpu?.addEventListener || !gpu?.removeEventListener || !gpu?.pushErrorScope || !gpu?.popErrorScope
          || typeof pipeline.fsoftmaxWithTemperature !== 'function') throw new Error('Required live GPU inspection hooks are unavailable');
        state.context = context; state.gpu = gpu;
        const report = state.report;
        state.listener = event => { if (report.gpuErrors.uncaptured.length < 8) report.gpuErrors.uncaptured.push(message(event.error)); };
        gpu.addEventListener('uncapturederror', state.listener);
        gpu.pushErrorScope('validation'); state.validationScope = true;
        return true;
      } catch (error) { await close(error); }
    },
    captureLogits(pipeline, logits, tensor) {
      if (!active(pipeline) || state.logits) return;
      if (!(logits instanceof Float32Array) || logits.length !== pipeline.fullVocabSize) throw new Error('Unexpected live CPU logits');
      state.logits = logits.slice();
      state.report.buffers.liveLogits = metadata(tensor);
    },
    captureLive(pipeline, probabilities, temperature) {
      if (!active(pipeline) || state.liveCPU) return;
      state.report.buffers.liveProbabilities = metadata(probabilities);
      state.report.buffers.liveTemperature = metadata(temperature);
      const { tvm } = pipeline;
      state.liveCPU = own(tvm.empty(probabilities.shape, probabilities.dtype, tvm.cpu())).copyFrom(probabilities);
      state.temperatureCPU = own(tvm.empty(temperature.shape, temperature.dtype, tvm.cpu())).copyFrom(temperature);
    },
    async compare(pipeline, originalSampledToken, settings) {
      if (!active(pipeline)) return;
      try {
        if (!state.logits || !state.liveCPU || !state.temperatureCPU) throw new Error('Required first-token capture was not reached');
        const maskedReference = allowGrammarMask === true && settings.grammarConstrained === true;
        if (settings.repetitionPenalty !== 1 || settings.frequencyPenalty !== 0 || settings.presencePenalty !== 0
          || settings.logitBiasPresent || (settings.grammarConstrained && !maskedReference)) throw new Error('Live logits have unsupported intervening modifiers');
        const report = state.report, { tvm, device } = pipeline;
        report.originalSampledToken = Number.isFinite(originalSampledToken) ? originalSampledToken : String(originalSampledToken);
        report.settings = { ...settings };
        report.referenceLogits = {
          scope: maskedReference ? 'post-grammar-mask-and-post-processor' : 'post-processor',
          allowsNegativeInfinityGrammarMask: maskedReference,
          finiteCount: state.logits.reduce((count, value) => count + Number.isFinite(value), 0),
          maskedNegativeInfinityCount: state.logits.reduce((count, value) => count + (value === -Infinity), 0),
          preservesOriginalSample: true,
        };
        const temperature = read(state.temperatureCPU), live = read(state.liveCPU);
        if (temperature.array.length !== 1 || !temperature.directVsToArray.matches) throw new Error('Original GPU temperature readback is inconsistent');
        report.actualFloat32Temperature = temperature.array[0];
        report.originalTemperatureDirectVsToArray = temperature.directVsToArray;
        const reference = stableSoftmaxReference(state.logits, temperature.array[0], { allowGrammarMask: maskedReference });
        report.live = compareSoftmaxOutput(live.array, reference);
        report.liveDirect = compareSoftmaxOutput(live.direct, reference);
        report.liveDirectVsToArray = live.directVsToArray;
        tvm.beginScope(); state.scope = true;
        const allocate = (shape, target) => own(tvm.empty(shape, 'float32', target));
        const freshInput = allocate([1, 1, pipeline.fullVocabSize], device).copyFrom(state.logits);
        const freshTemperature = allocate([1], device).copyFrom(temperature.array);
        report.buffers.freshLogits = metadata(freshInput);
        report.buffers.freshTemperature = metadata(freshTemperature);
        const returnedInput = allocate(freshInput.shape, tvm.cpu()).copyFrom(freshInput);
        const returnedTemperature = allocate([1], tvm.cpu()).copyFrom(freshTemperature);
        await device.sync();
        const inputRead = read(returnedInput), temperatureRead = read(returnedTemperature);
        report.inputRoundtrip = { direct: compareTransferBytes(bytes(state.logits), bytes(inputRead.direct)),
          toArray: compareTransferBytes(bytes(state.logits), bytes(inputRead.array)) };
        report.temperatureRoundtrip = { direct: compareTransferBytes(bytes(temperature.array), bytes(temperatureRead.direct)),
          toArray: compareTransferBytes(bytes(temperature.array), bytes(temperatureRead.array)) };
        const freshProbs = own(pipeline.fsoftmaxWithTemperature(freshInput, freshTemperature));
        report.buffers.freshProbabilities = metadata(freshProbs);
        const freshCPU = allocate(freshProbs.shape, tvm.cpu()).copyFrom(freshProbs);
        await device.sync();
        const fresh = read(freshCPU);
        report.fresh = compareSoftmaxOutput(fresh.array, reference);
        report.freshDirect = compareSoftmaxOutput(fresh.direct, reference);
        report.freshDirectVsToArray = fresh.directVsToArray;
        report.liveVsFresh = compareTransferBytes(bytes(live.array), bytes(fresh.array));
        report.comparisonCompleted = true;
      } catch (error) { return close(error); }
      return close();
    },
    async abort(error) { if (state !== null) return close(error); },
  };
}

/** Applies only after the existing default sampling transform, never its pre-sort variant. */
export function instrumentModelBufferRuntime(source, { allowGrammarMask = false } = {}) {
  const prefill = `prefillStep(inp, msgRole, // either user or tool
    inp_role_str, genConfig) {
        return __awaiter(this, void 0, void 0, function* () {`;
  const prefillEnd = `this.processNextToken(nextToken, genConfig);
        });
    }
    decodeStep(genConfig)`;
  const logits = 'logitsOnCPUArray = this.logitProcessor.processLogits(logitsOnCPUArray);';
  const probabilities = 'probs = probs.view([numProbs, this.fullVocabSize]);';
  const sampled = 'sampledTokensHost.dispose();';
  if (!source.includes('const __tg2SamplingDiagnostics =') || source.includes('__tg2BeforeSortingCPU')
    || source.includes('__tg2ModelBuffer')) throw new Error('Model-buffer diagnostic requires the default sampling transform exactly once');
  for (const marker of [prefill, prefillEnd, logits, probabilities, sampled]) {
    if (source.split(marker).length - 1 !== 1) throw new Error(`Model-buffer diagnostic source no longer matches: ${marker}`);
  }
  if (allowGrammarMask === true) {
    // Pinned runtime order: apply GPU mask, synchronize its CPU copy, process/capture, then copy back.
    const ordered = [
      'this.fapplyBitmask(logitsOnGPU.view([1, this.fullVocabSize]), seqIdsArray, bitMaskOnGPU);',
      'this.updateLogitsOnCPU(logitsOnGPU);\n                this.tvm.endScope();\n                yield this.device.sync();',
      'let logitsOnCPUArray = (this.logitsOnCPU.toArray());', logits,
      'logitsOnGPU.copyFrom(logitsOnCPUArray);',
      'let probs = this.fsoftmaxWithTemperature(logitsOnGPU.view([numSeqs, numProbs, this.fullVocabSize]), temperaturesDevice);',
    ];
    if (ordered.some(marker => source.split(marker).length !== 2)
      || !ordered.every((marker, index) => index === 0 || source.indexOf(marker) > source.indexOf(ordered[index - 1]))) {
      throw new Error('Grammar-mask diagnostic requires the pinned mask-before-CPU-capture ordering');
    }
  }
  const options = allowGrammarMask === true ? 'undefined, { allowGrammarMask: true }' : '';
  const helpers = `const compareTransferBytes = ${compareTransferBytes.toString()};\nconst stableSoftmaxReference = ${stableSoftmaxReference.toString()};\nconst compareSoftmaxOutput = ${compareSoftmaxOutput.toString()};\nconst __tg2ModelBuffer = (${createModelBufferDiagnostics.toString()})(${options});\n`;
  return helpers + source
    .replace(prefill, prefill + '\n            const __tg2ModelBufferActive = yield __tg2ModelBuffer.begin(this, genConfig);\n            try {')
    .replace(prefillEnd, `this.processNextToken(nextToken, genConfig);
            } catch (__tg2ModelBufferError) {
                if (__tg2ModelBufferActive) yield __tg2ModelBuffer.abort(__tg2ModelBufferError);
                throw __tg2ModelBufferError;
            }
        });
    }
    decodeStep(genConfig)`)
    .replace(logits, logits + '\n                __tg2ModelBuffer.captureLogits(this, logitsOnCPUArray, logitsOnGPU);')
    .replace(probabilities, probabilities + '\n            __tg2ModelBuffer.captureLive(this, probs, temperaturesDevice);')
    .replace(sampled, sampled + `
            yield __tg2ModelBuffer.compare(this, sampledToken, {
                temperature, topP: top_p, repetitionPenalty: repetition_penalty,
                frequencyPenalty: frequency_penalty, presencePenalty: presence_penalty,
                logitBiasPresent: _hasValue(logit_bias), grammarConstrained,
            });`);
}

export function modelBufferDiagnosticPlugin(paths, options) {
  const allowed = new Set(paths);
  return { name: 'tg2-isolated-model-buffer-diagnostic', enforce: 'pre',
    transform(source, id) {
      return allowed.has(id.split('?')[0]) ? { code: instrumentModelBufferRuntime(source, options), map: null } : null;
    } };
}
