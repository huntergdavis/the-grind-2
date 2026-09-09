import { resolve } from 'node:path';
import { createDeviceLossWatch } from './webgpu-first-token-stop.mjs';

/** Keeps observation alive through decode and stream drainage, not merely prefill. */
export function createCompleteStoryDiagnostics(snapshotSubmission, createWatch,
  emit = record => console.debug('TG2_COMPLETE_STORY ' + JSON.stringify(record)),
  emitLoss = record => console.debug('TG2_DEVICE_LOSS ' + JSON.stringify(record))) {
  let pipeline = null, started = false, stopped = false, finished = false;
  const errors = [], deviceLosses = [];
  const note = error => { if (errors.length < 3) errors.push(String(error?.message ?? error).slice(0, 600)); };
  const watch = createWatch(loss => {
    if (deviceLosses.length < 1) deviceLosses.push({ ...loss });
    try { emitLoss(loss); } catch (error) { note(error); }
  });
  return {
    start(currentPipeline) {
      if (started || finished) return;
      pipeline = currentPipeline;
      try { watch.start(pipeline); started = true; }
      catch (error) { note(error); throw error; }
    },
    finish(completed, error) {
      if (finished) return;
      finished = true;
      if (error !== undefined) note(error);
      if (!started) note('First-prefill device-loss observation was not started');
      if (pipeline !== null) {
        try { watch.stop(pipeline); stopped = true; } catch (failure) { note(failure); }
      }
      let submission = null;
      try { submission = snapshotSubmission(); } catch (failure) { note(failure); }
      emit({ kind: 'complete-story', completed: completed === true,
        deviceLossWindow: 'first-prefill-through-worker-write-settlement',
        submissionCounterWindow: 'worker-lifetime-through-write-settlement',
        watchStarted: started, watchStopped: stopped, submission,
        deviceLosses: deviceLosses.map(loss => ({ ...loss })), errors: [...errors] });
    },
  };
}

/** This validates diagnostic completion, not literary quality or archive admission. */
export function isCompleteStoryDiagnostic(record) {
  const s = record?.submission;
  return record?.kind === 'complete-story' && record.completed === true
    && record.deviceLossWindow === 'first-prefill-through-worker-write-settlement'
    && record.submissionCounterWindow === 'worker-lifetime-through-write-settlement'
    && record.watchStarted === true && record.watchStopped === true
    && Array.isArray(record.errors) && record.errors.length === 0
    && Array.isArray(record.deviceLosses) && record.deviceLosses.length === 0
    && Number.isSafeInteger(s?.encodedDispatches) && s.encodedDispatches > 0
    && s.flushAttempts === s.encodedDispatches && s.flushedDispatches === s.encodedDispatches
    && s.maxPendingDispatchesBeforeFlush === 1 && s.missingPendingEncoderCount === 0
    && s.pendingEncoderAfterFlushCount === 0 && s.invalidPendingCount === 0
    && Array.isArray(s.errors) && s.errors.length === 0;
}

/** Three writes at most; each owns a fresh loss watch and a cumulative submission receipt. */
export function createConnectedStoryDiagnostics(snapshotSubmission, createWatch,
  emit = record => console.debug('TG2_COMPLETE_STORY ' + JSON.stringify(record)),
  emitLoss = record => console.debug('TG2_DEVICE_LOSS ' + JSON.stringify(record)),
  createStory = createCompleteStoryDiagnostics) {
  let story = 0, active = null, pipeline = null, failed = false;
  const begin = () => {
    if (story >= 3) throw new Error('Connected-story diagnostic permits only three writes');
    const index = ++story;
    active = createStory(snapshotSubmission, createWatch,
      record => emit({ ...record, story: index }),
      loss => emitLoss({ ...loss, story: index }));
  };
  return {
    start(currentPipeline) {
      if (failed) throw new Error('Connected-story diagnostic cannot resume after a failed write');
      if (active !== null) {
        if (pipeline !== currentPipeline) throw new Error('Connected-story diagnostic cannot overlap pipelines');
        return;
      }
      begin();
      pipeline = currentPipeline;
      active.start(pipeline);
    },
    finish(completed, error) {
      if (failed) return;
      if (active === null) {
        // A failed write can settle before its first eligible prefill. It must not disappear.
        if (completed === true || story >= 3) return;
        begin();
      }
      failed = completed !== true || error !== undefined;
      const settling = active;
      try { settling.finish(completed, error); }
      catch (failure) { failed = true; throw failure; }
      finally { active = null; pipeline = null; }
    },
  };
}

/** Validates each write's watch and advancing worker-lifetime counters, not prose or all-token math. */
export function isCompleteConnectedStoryEvidence(records, expectedCount) {
  return Number.isSafeInteger(expectedCount) && expectedCount >= 1 && expectedCount <= 3
    && Array.isArray(records) && records.length === expectedCount
    && records.every((record, index) => record?.story === index + 1 && isCompleteStoryDiagnostic(record)
      && (index === 0 || ['encodedDispatches', 'flushAttempts', 'flushedDispatches']
        .every(key => record.submission[key] > records[index - 1].submission[key])));
}

/** The worker preserves its original failed reply even when diagnostic settlement fails. */
export function finishCompleteStoryWorker(completed, error, host = globalThis) {
  try {
    const finish = Reflect.get(host, '__tg2CompleteStoryFinish');
    if (typeof finish !== 'function') throw new Error('Complete-story runtime settlement hook is unavailable');
    finish(completed, error);
  } catch (failure) {
    if (completed) throw failure;
    console.debug('TG2_COMPLETE_STORY ' + JSON.stringify({ kind: 'complete-story', completed: false,
      deviceLossWindow: 'first-prefill-through-worker-write-settlement',
      submissionCounterWindow: 'worker-lifetime-through-write-settlement',
      watchStarted: false, watchStopped: false, submission: null, deviceLosses: [],
      errors: [String(failure?.message ?? failure).slice(0, 600)] }));
  }
}

export function instrumentCompleteStoryRuntime(source, { connected = false } = {}) {
  const begin = 'const __tg2ModelBufferActive = yield __tg2ModelBuffer.begin(this, genConfig);\n            try {';
  const counters = 'const __tg2SubmissionDiagnostics =';
  if (!source.includes(counters) || !source.includes('TG2_DISPATCH_DIAGNOSTIC ')
    || !source.includes('snapshot() { return { ...counters, errors: [...counters.errors] }; }')
    || source.includes('__tg2FirstTokenStop') || source.includes('__tg2CompleteStory')) {
    throw new Error('Complete-story diagnostic requires submission instrumentation without a first-token stop exactly once');
  }
  for (const marker of [begin, counters]) {
    if (source.split(marker).length - 1 !== 1) throw new Error('Complete-story runtime source no longer matches');
  }
  const factory = connected ? createConnectedStoryDiagnostics : createCompleteStoryDiagnostics;
  const dependencies = connected ? `, undefined, undefined, (${createCompleteStoryDiagnostics.toString()})` : '';
  const setup = `const __tg2CompleteStory = (${factory.toString()})(
  () => __tg2SubmissionDiagnostics.snapshot(), (${createDeviceLossWatch.toString()})${dependencies});
if (Reflect.has(globalThis, '__tg2CompleteStoryFinish')) throw new Error('Complete-story runtime hook already exists');
Reflect.set(globalThis, '__tg2CompleteStoryFinish', (completed, error) => __tg2CompleteStory.finish(completed, error));
`;
  const gate = connected ? 'genConfig?.enable_thinking === false && genConfig.max_tokens === 68' : '__tg2ModelBufferActive';
  return setup + source.replace(begin, begin + `\n            if (${gate}) __tg2CompleteStory.start(this);`);
}

export function instrumentCompleteStoryWorker(source) {
  const written = 'const text = await write(readMessages(request.messages));';
  const failed = 'workerScope.postMessage({ type: "error", id, ...(error instanceof WriterSetupError ? { code: error.code } : {}) });';
  if (!source.includes('const stripEmptyThinkingHeader =') || source.includes('__tg2FinishCompleteStoryWorker')) {
    throw new Error('Complete-story worker requires the candidate adapter exactly once');
  }
  for (const marker of [written, failed]) {
    if (source.split(marker).length - 1 !== 1) throw new Error('Complete-story worker source no longer matches');
  }
  return `const __tg2FinishCompleteStoryWorker = ${finishCompleteStoryWorker.toString()};\n` + source
    .replace(written, written + '\n      __tg2FinishCompleteStoryWorker(true);')
    .replace(failed, 'if (request.type === "write") __tg2FinishCompleteStoryWorker(false, error);\n    ' + failed);
}

export function completeStoryPlugin(repo, runtimePaths, options) {
  const runtimes = new Set(runtimePaths), worker = resolve(repo, 'src/narrator/creative-writer.worker.ts');
  return { name: 'tg2-isolated-complete-story', enforce: 'pre',
    transform(source, id) {
      const path = id.split('?')[0];
      if (runtimes.has(path)) return { code: instrumentCompleteStoryRuntime(source, options), map: null };
      return path === worker ? { code: instrumentCompleteStoryWorker(source), map: null } : null;
    } };
}
