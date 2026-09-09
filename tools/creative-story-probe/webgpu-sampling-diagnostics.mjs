/** Tool-only observer. Readbacks perturb timing; they never replace scores or sampling. */
export function createSamplingDiagnostics(emit) {
  const tolerance = 1e-3;
  let step = 0, before = null, after = null;
  const encoded = (value) => Number.isFinite(value) ? value
    : Number.isNaN(value) ? 'NaN' : value > 0 ? '+Infinity' : '-Infinity';
  const summarize = (data) => {
    let nanCount = 0, positiveInfinityCount = 0, negativeInfinityCount = 0;
    let finiteMin = null, finiteMax = null, argmax = null;
    for (let index = 0; index < data.length; index++) {
      const value = data[index];
      if (Number.isNaN(value)) nanCount++;
      else if (value === Infinity) positiveInfinityCount++;
      else if (value === -Infinity) negativeInfinityCount++;
      else {
        if (finiteMin === null || value < finiteMin) finiteMin = value;
        if (finiteMax === null || value > finiteMax) { finiteMax = value; argmax = index; }
      }
    }
    return { vocabularySize: data.length, nanCount, positiveInfinityCount,
      negativeInfinityCount, finiteMin, finiteMax, argmax };
  };
  return {
    canObserve: () => step < 64,
    beforeProcessor(data) {
      if (step >= 64) return;
      before = summarize(data);
      after = null;
    },
    afterProcessor(data) { if (step < 64) after = summarize(data); },
    sampled(data, token, settings) {
      if (step >= 64) return;
      const probabilities = summarize(data);
      const allFinite = probabilities.nanCount + probabilities.positiveInfinityCount
        + probabilities.negativeInfinityCount === 0;
      const sampledTokenInRange = Number.isInteger(token) && token >= 0 && token < data.length;
      const sampledProbability = sampledTokenInRange ? data[token] : null;
      let sum = 0, positiveCount = 0, negativeCount = 0, aboveOneCount = 0, greaterMass = 0;
      for (let index = 0; index < data.length; index++) {
        const value = data[index];
        if (value > 0) positiveCount++;
        if (value < 0) negativeCount++;
        if (value > 1) aboveOneCount++;
        sum += value;
        if (sampledProbability !== null && value > sampledProbability) greaterMass += value;
      }
      const normalizationError = allFinite ? Math.abs(sum - 1) : null;
      const normalized = allFinite && negativeCount === 0 && aboveOneCount === 0
        && normalizationError <= tolerance;
      const comparableSample = sampledTokenInRange && Number.isFinite(sampledProbability) && allFinite;
      const record = {
        step: ++step, beforeProcessor: before, afterProcessor: after,
        probabilities: { ...probabilities, sum: allFinite ? sum : null, normalizationError,
          normalizationTolerance: tolerance, normalized, positiveCount, negativeCount, aboveOneCount },
        sampledToken: encoded(token), sampledTokenInRange,
        sampledProbability: sampledProbability === null ? null : encoded(sampledProbability),
        strictlyGreaterProbabilityMass: comparableSample ? greaterMass : null,
        outsideTopPNucleus: normalized && comparableSample && Number.isFinite(settings.topP)
          ? greaterMass > settings.topP + tolerance : null,
        settings: { temperature: settings.temperature, topP: settings.topP,
          repetitionPenalty: settings.repetitionPenalty, frequencyPenalty: settings.frequencyPenalty,
          presencePenalty: settings.presencePenalty, logitBiasPresent: settings.logitBiasPresent,
          grammarConstrained: settings.grammarConstrained },
      };
      before = after = null;
      // An observer failure must not change generation or release semantics.
      try { emit(record); } catch { /* Diagnostic only. */ }
      return record;
    },
  };
}

export function isCandidateSamplingRequest(genConfig) {
  return genConfig?.enable_thinking === false && genConfig.max_tokens === 68;
}

export function compareSortingProbabilities(before, after, beforeSorting) {
  const beforeBits = new Uint32Array(before.buffer, before.byteOffset, before.length);
  const afterBits = new Uint32Array(after.buffer, after.byteOffset, after.length);
  let mismatchedValues = 0, firstDifferenceIndex = null, maxFiniteAbsoluteDifference = 0;
  let nonfiniteDifferenceCount = 0;
  for (let index = 0; index < Math.max(before.length, after.length); index++) {
    if (beforeBits[index] !== afterBits[index]) {
      mismatchedValues++;
      if (firstDifferenceIndex === null) firstDifferenceIndex = index;
      if (Number.isFinite(before[index]) && Number.isFinite(after[index])) {
        maxFiniteAbsoluteDifference = Math.max(maxFiniteAbsoluteDifference, Math.abs(before[index] - after[index]));
      } else nonfiniteDifferenceCount++;
    }
  }
  return { beforeSorting, unchangedAfterSorting: mismatchedValues === 0,
    sortingDifference: { beforeLength: before.length, afterLength: after.length, mismatchedValues,
      firstDifferenceIndex, beforeBits: firstDifferenceIndex === null ? null : beforeBits[firstDifferenceIndex] ?? null,
      afterBits: firstDifferenceIndex === null ? null : afterBits[firstDifferenceIndex] ?? null,
      maxFiniteAbsoluteDifference, nonfiniteDifferenceCount } };
}

export function observeSortingSnapshot(tensor, after, token, settings, consume) {
  try {
    const before = tensor.toArray();
    const afterValues = typeof after === 'function' ? after() : after;
    const summary = createSamplingDiagnostics(() => {}).sampled(before, token, settings).probabilities;
    return consume(compareSortingProbabilities(before, afterValues, summary), afterValues);
  } finally { tensor.dispose(); }
}

export function instrumentSamplingRuntime(source, { beforeSort = false } = {}) {
  const markers = [
    'let logitsOnCPUArray = (this.logitsOnCPU.toArray());',
    'logitsOnCPUArray = this.logitProcessor.processLogits(logitsOnCPUArray);',
    'if (logprobs && top_logprobs > 0) {\n                this.updateLogitsOnCPU(probs);\n            }',
    'sampledToken = sampledTokensHost.toArray()[0];',
    'const outputTokenBegin = performance.now();',
  ];
  if (source.includes('__tg2SamplingDiagnostics')) throw new Error('Sampling diagnostic is already installed');
  for (const marker of markers) {
    if (source.split(marker).length - 1 !== 1) throw new Error(`Sampling diagnostic source no longer matches: ${marker}`);
  }
  const prefix = `const __tg2ShouldObserveSampling = ${isCandidateSamplingRequest.toString()};\nconst __tg2SamplingDiagnostics = (${createSamplingDiagnostics.toString()})(record => console.debug('TG2_SAMPLING_DIAGNOSTIC ' + JSON.stringify(record)));\n`;
  const instrumented = prefix + source
    .replace(markers[4], markers[4] + '\n            const __tg2ObserveSampling = __tg2ShouldObserveSampling(genConfig) && __tg2SamplingDiagnostics.canObserve();')
    .replace(markers[0], markers[0] + '\n                if (__tg2ObserveSampling) __tg2SamplingDiagnostics.beforeProcessor(logitsOnCPUArray);')
    .replace(markers[1], markers[1] + '\n                if (__tg2ObserveSampling) __tg2SamplingDiagnostics.afterProcessor(logitsOnCPUArray);')
    .replace(markers[2], 'if ((logprobs && top_logprobs > 0) || __tg2ObserveSampling) {\n                this.updateLogitsOnCPU(probs);\n            }')
    .replace(markers[3], markers[3] + `
            if (__tg2ObserveSampling) {
                __tg2SamplingDiagnostics.sampled(this.logitsOnCPU.toArray(), sampledToken, {
                    temperature, topP: top_p, repetitionPenalty: repetition_penalty,
                    frequencyPenalty: frequency_penalty, presencePenalty: presence_penalty,
                    logitBiasPresent: _hasValue(logit_bias), grammarConstrained,
                });
            }`);
  if (!beforeSort) return instrumented;
  const viewMarker = 'probs = probs.view([numProbs, this.fullVocabSize]);';
  const observeMarker = `if (__tg2ObserveSampling) {
                __tg2SamplingDiagnostics.sampled(this.logitsOnCPU.toArray(), sampledToken, {
                    temperature, topP: top_p, repetitionPenalty: repetition_penalty,
                    frequencyPenalty: frequency_penalty, presencePenalty: presence_penalty,
                    logitBiasPresent: _hasValue(logit_bias), grammarConstrained,
                });
            }`;
  for (const marker of [viewMarker, observeMarker, 'const argsortResults = this.fargsortProbs(probs);']) {
    if (instrumented.split(marker).length - 1 !== 1) throw new Error(`Pre-sort diagnostic source no longer matches: ${marker}`);
  }
  const helpers = `const createSamplingDiagnostics = ${createSamplingDiagnostics.toString()};\nconst compareSortingProbabilities = ${compareSortingProbabilities.toString()};\nconst observeSortingSnapshot = ${observeSortingSnapshot.toString()};\nlet __tg2SortingFields = null;\n`;
  return helpers + instrumented
    .replace("JSON.stringify(record)));", "JSON.stringify({ ...record, ...__tg2SortingFields })));")
    .replace(markers[4], markers[4] + '\n            let __tg2BeforeSortingCPU;\n            let __tg2LogitTensorMetadata = null;')
    .replace('if (__tg2ObserveSampling) __tg2SamplingDiagnostics.beforeProcessor(logitsOnCPUArray);', `if (__tg2ObserveSampling) {
                    __tg2LogitTensorMetadata = { shape: [...logitsOnGPU.shape], dtype: logitsOnGPU.dtype,
                        byteOffset: logitsOnGPU.byteOffset, fullVocabSize: this.fullVocabSize };
                    __tg2SamplingDiagnostics.beforeProcessor(logitsOnCPUArray);
                }`)
    .replace(viewMarker, viewMarker + `
            if (__tg2ObserveSampling) {
                __tg2BeforeSortingCPU = this.tvm.detachFromCurrentScope(this.tvm
                    .empty(probs.shape, probs.dtype, this.tvm.cpu()).copyFrom(probs));
            }`)
    .replace(observeMarker, `if (__tg2ObserveSampling) {
                const __tg2Settings = { temperature, topP: top_p, repetitionPenalty: repetition_penalty,
                    frequencyPenalty: frequency_penalty, presencePenalty: presence_penalty,
                    logitBiasPresent: _hasValue(logit_bias), grammarConstrained };
                try {
                    observeSortingSnapshot(__tg2BeforeSortingCPU, () => this.logitsOnCPU.toArray(), sampledToken, __tg2Settings, (fields, __tg2AfterSorting) => {
                        __tg2SortingFields = { logitTensorMetadata: __tg2LogitTensorMetadata, ...fields };
                        __tg2SamplingDiagnostics.sampled(__tg2AfterSorting, sampledToken, __tg2Settings);
                    });
                } finally { __tg2SortingFields = null; }
            }`);
}

/** The runner supplies only its exact pinned root/staged runtime library paths. */
export function samplingDiagnosticPlugin(paths, options) {
  const allowed = new Set(paths);
  return {
    name: 'tg2-isolated-sampling-diagnostic', enforce: 'pre',
    transform(source, id) {
      return allowed.has(id.split('?')[0]) ? { code: instrumentSamplingRuntime(source, options), map: null } : null;
    },
  };
}
