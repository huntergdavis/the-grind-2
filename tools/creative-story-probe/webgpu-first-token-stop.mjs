/** Tool-only observation window; never changes device or suppresses native errors. */
export function createDeviceLossWatch(emit = record => console.debug('TG2_DEVICE_LOSS ' + JSON.stringify(record))) {
  const watches = new WeakMap();
  return {
    start(pipeline) {
      const gpu = pipeline.tvm?.lib?.webGPUContext?.device;
      if (!gpu?.lost?.then) throw new Error('Native GPU device-loss observation is unavailable');
      const watch = { active: true };
      watches.set(pipeline, watch);
      gpu.lost.then(info => {
        if (watch.active) emit({ reason: String(info.reason).slice(0, 100), message: String(info.message).slice(0, 1000) });
      }, error => {
        if (watch.active) emit({ reason: 'observation-failed', message: String(error).slice(0, 1000) });
      });
    },
    stop(pipeline) {
      const watch = watches.get(pipeline);
      if (watch) watch.active = false;
      watches.delete(pipeline);
    },
  };
}

/** Shared first-comparison evidence; numerical mismatch remains an explicit diagnostic result. */
export function hasCompleteFirstTokenEvidence(report) {
  const comparison = report.modelBufferObservations?.[0];
  const dispatches = report.dispatchObservations ?? [];
  return report.samplingObservations?.length >= 1 && report.samplingObservations.length <= 64
    && report.modelBufferObservations?.length === 1 && comparison.comparisonCompleted === true
    && comparison.error === null && comparison.cleanup?.errors?.length === 0
    && comparison.gpuErrors?.validation === null && comparison.gpuErrors?.uncaptured?.length === 0
    && comparison.cleanup.synchronized === true && comparison.cleanup.listenerRemoved === true
    && comparison.cleanup.tensorsAllocated > 0
    && comparison.cleanup.tensorsAllocated === comparison.cleanup.tensorsDisposed
    && report.errors?.length === 0 && report.deviceLosses?.length === 0
    && dispatches.length > 0 && dispatches.length <= 16
    && dispatches.every(record => record && record.scopeCallError === null && record.scopeTruncated === false
      && (record.kind === 'softmax-call-without-dispatch'
        ? record.scopeObservedDispatches === 0 && record.scopeRecordedDispatches === 0
        : record.kind === 'softmax-shader-dispatch' && record.diagnosticError === null && !record.wgslHashError
          && record.metadataTruncated === false && record.wgslTruncated === false
          && /^[a-f0-9]{64}$/.test(record.wgslSha256)))
    && ['live', 'fresh'].every(label => dispatches.some(record => record.label === label));
}

/** Preserve the actual failed worker reply: a controlled diagnostic stop is not a story. */
export function isExpectedFirstTokenStop(report, result) {
  const stop = report.firstTokenStops?.[0];
  return hasCompleteFirstTokenEvidence(report) && report.samplingObservations.length === 1
    && report.firstTokenStops?.length === 1 && stop.reason === 'comparison-complete'
    && stop.afterSample === 1 && result.status === 'failed' && result.raw === null && result.cleaned === null
    && result.error === 'Error: Creative writer could not finish. Load it again to retry.';
}

export function instrumentFirstTokenStop(source) {
  const begin = `const __tg2ModelBufferActive = yield __tg2ModelBuffer.begin(this, genConfig);
            try {`;
  const end = `throw __tg2ModelBufferError;
            }
        });
    }
    decodeStep(genConfig)`;
  const compare = `yield __tg2ModelBuffer.compare(this, sampledToken, {
                temperature, topP: top_p, repetitionPenalty: repetition_penalty,
                frequencyPenalty: frequency_penalty, presencePenalty: presence_penalty,
                logitBiasPresent: _hasValue(logit_bias), grammarConstrained,
            });`;
  if (!source.includes('TG2_DISPATCH_DIAGNOSTIC ') || source.includes('__tg2FirstTokenStop')) {
    throw new Error('First-token stop requires dispatch instrumentation exactly once');
  }
  for (const marker of [begin, end, compare]) {
    if (source.split(marker).length - 1 !== 1) throw new Error('First-token stop source no longer matches');
  }
  return `const __tg2FirstTokenStopWatch = (${createDeviceLossWatch.toString()})();\n` + source
    .replace(begin, begin + '\n                if (__tg2ModelBufferActive) __tg2FirstTokenStopWatch.start(this);')
    .replace(end, `throw __tg2ModelBufferError;
            } finally { __tg2FirstTokenStopWatch.stop(this); }
        });
    }
    decodeStep(genConfig)`)
    .replace(compare, 'const __tg2FirstTokenStopResult = ' + compare + `
            if (__tg2FirstTokenStopResult?.comparisonCompleted) {
                console.debug('TG2_FIRST_TOKEN_STOP ' + JSON.stringify({ reason: 'comparison-complete', afterSample: 1 }));
                throw new Error('Intentional first-token diagnostic stop');
            }`);
}

export function firstTokenStopPlugin(paths) {
  const allowed = new Set(paths);
  return { name: 'tg2-isolated-first-token-stop', enforce: 'pre',
    transform(source, id) {
      return allowed.has(id.split('?')[0]) ? { code: instrumentFirstTokenStop(source), map: null } : null;
    } };
}
