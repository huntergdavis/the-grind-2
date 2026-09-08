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

export function instrumentSamplingRuntime(source) {
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
  return prefix + source
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
}

/** The runner supplies only its exact pinned root/staged runtime library paths. */
export function samplingDiagnosticPlugin(paths) {
  const allowed = new Set(paths);
  return {
    name: 'tg2-isolated-sampling-diagnostic', enforce: 'pre',
    transform(source, id) {
      return allowed.has(id.split('?')[0]) ? { code: instrumentSamplingRuntime(source), map: null } : null;
    },
  };
}
