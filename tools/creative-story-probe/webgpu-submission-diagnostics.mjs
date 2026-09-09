/** Experimental queue-boundary change only: no GPU wait, shader, score, or RNG changes. */
export function createSubmissionDiagnostics(
  emit = record => console.debug('TG2_SUBMISSION_DIAGNOSTIC ' + JSON.stringify(record)),
) {
  let reported = false;
  const counters = { encodedDispatches: 0, flushAttempts: 0, flushedDispatches: 0,
    maxPendingDispatchesBeforeFlush: 0, missingPendingEncoderCount: 0,
    pendingEncoderAfterFlushCount: 0, invalidPendingCount: 0, errors: [] };
  return {
    snapshot() { return { ...counters, errors: [...counters.errors] }; },
    afterDispatch(context) {
      counters.encodedDispatches++;
      const pending = context.pendingDispatchCount;
      if (Number.isSafeInteger(pending) && pending >= 0) {
        counters.maxPendingDispatchesBeforeFlush = Math.max(counters.maxPendingDispatchesBeforeFlush, pending);
      } else counters.invalidPendingCount++;
      const hadEncoder = context.pendingEncoder != null;
      if (!hadEncoder) counters.missingPendingEncoderCount++;
      counters.flushAttempts++;
      try {
        context.flushCommands();
        if (hadEncoder && context.pendingEncoder == null) counters.flushedDispatches++;
        if (context.pendingEncoder != null) counters.pendingEncoderAfterFlushCount++;
      } catch (error) {
        if (counters.errors.length === 0) counters.errors.push(String(error?.message ?? error).slice(0, 600));
        throw error;
      }
    },
    report(modelBufferReport) {
      if (reported) return;
      reported = true;
      emit({ kind: 'per-dispatch-submission', scope: 'worker-lifetime-through-first-model-buffer-report',
        changesQueueBoundaries: true, changesShaders: false, changesScores: false, addsGPUWaits: false,
        timingAndAllocationMayChange: true, comparisonCompleted: modelBufferReport?.comparisonCompleted === true,
        ...counters, errors: [...counters.errors] });
    },
  };
}

export function isCompleteSubmissionDiagnostic(record) {
  return record?.kind === 'per-dispatch-submission'
    && record.scope === 'worker-lifetime-through-first-model-buffer-report'
    && record.comparisonCompleted === true && record.changesQueueBoundaries === true
    && record.changesShaders === false && record.changesScores === false && record.addsGPUWaits === false
    && Number.isSafeInteger(record.encodedDispatches) && record.encodedDispatches > 0
    && record.flushAttempts === record.encodedDispatches && record.flushedDispatches === record.encodedDispatches
    && record.maxPendingDispatchesBeforeFlush === 1 && record.missingPendingEncoderCount === 0
    && record.pendingEncoderAfterFlushCount === 0 && record.invalidPendingCount === 0
    && Array.isArray(record.errors) && record.errors.length === 0;
}

/** Last opt-in transform, after sampling, model-buffer, dispatch and optional first-token stop. */
export function instrumentSubmissionRuntime(source) {
  const ended = 'compute.end();', report = 'emit(report);';
  const submitted = 'this.device.queue.submit([this.pendingEncoder.finish()]);';
  if (!source.includes('const __tg2Dispatch =') || !source.includes('const __tg2ModelBuffer =')
    || !source.includes('const __tg2SamplingDiagnostics =') || source.includes('__tg2SubmissionDiagnostics')) {
    throw new Error('Submission diagnostic requires the dispatch transform exactly once');
  }
  for (const marker of [ended, report, submitted]) {
    if (source.split(marker).length - 1 !== 1) throw new Error(`Submission diagnostic source no longer matches: ${marker}`);
  }
  return `const __tg2SubmissionDiagnostics = (${createSubmissionDiagnostics.toString()})();\n` + source
    .replace(ended, ended + '\n                    __tg2SubmissionDiagnostics.afterDispatch(this);')
    .replace(report, '__tg2SubmissionDiagnostics.report(report);\n    ' + report);
}

export function submissionDiagnosticPlugin(paths) {
  const allowed = new Set(paths);
  return { name: 'tg2-isolated-per-dispatch-submission', enforce: 'pre',
    transform(source, id) {
      return allowed.has(id.split('?')[0]) ? { code: instrumentSubmissionRuntime(source), map: null } : null;
    } };
}
