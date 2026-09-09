import { resolve } from 'node:path';

/** Observer only: no readbacks, GPU waits, request changes, or generation decisions. */
export function createWriteTimingDiagnostics(
  emit = record => console.debug('TG2_WRITE_TIMING ' + JSON.stringify(record)),
  now = () => performance.now(), dispatchCount = () => null,
) {
  let started = null, settled = false, sequence = 0, dropped = 0;
  let prefillStarted = null, decodeStarted = null, decodedSteps = 0, textChunks = 0;
  const clock = () => Math.max(0, Math.round(now() - started));
  const partial = text => {
    const original = String(text ?? '');
    let partialText = original.slice(0, 3000);
    // Bound the serialized event too, including escaped control characters.
    while (JSON.stringify(partialText).length > 3000) partialText = partialText.slice(0, Math.floor(partialText.length * 0.8));
    return { partial: true, partialText, partialTextTruncated: partialText.length !== original.length, textChunks };
  };
  const record = (phase, fields = {}) => {
    if (started === null || settled) return;
    const final = phase === 'write-success' || phase === 'write-error';
    // Reserve one settlement record. Overflow is explicit and cannot qualify.
    if (sequence >= 127 && !final) { dropped++; return; }
    if (sequence >= 128) { dropped++; return; }
    let dispatches = null;
    try { dispatches = dispatchCount(); } catch { /* Timing must not alter a write. */ }
    const value = { kind: 'write-timing', sequence: ++sequence, phase, elapsedMs: clock(),
      encodedDispatches: Number.isSafeInteger(dispatches) && dispatches >= 0 ? dispatches : null, ...fields };
    if (final) { value.decodedSteps = decodedSteps; value.textChunks = textChunks; value.droppedEvents = dropped; settled = true; }
    try { emit(value); } catch { dropped++; }
  };
  const stats = pipeline => {
    try {
      return { prefillTokens: pipeline.getCurRoundPrefillTotalTokens(),
        prefillMs: pipeline.getCurRoundPrefillTotalTime() * 1000,
        decodeTokens: pipeline.getCurRoundDecodingTotalTokens(),
        decodeMs: pipeline.getCurRoundDecodingTotalTime() * 1000 };
    } catch { return { prefillTokens: null, prefillMs: null, decodeTokens: null, decodeMs: null }; }
  };
  return {
    worker(phase, text, error) {
      if (phase === 'write-start') {
        if (started !== null) { record('observer-error', { error: 'Only one timed write is permitted' }); return; }
        started = now();
      }
      if (phase === 'chunk') {
        if (started === null || settled) return;
        textChunks++;
        if (textChunks === 1 || textChunks % 8 === 0) record('partial-text', partial(text));
        return;
      }
      record(phase, { ...(phase === 'stream-drained' ? partial(text) : {}),
        ...(error === undefined ? {} : { error: String(error?.message ?? error).slice(0, 400) }) });
    },
    begin(phase, pipeline) {
      if (started === null || settled) return;
      if (phase === 'prefill') {
        prefillStarted = now(); record('prefill-start', stats(pipeline));
      } else {
        decodeStarted = now();
        if (decodedSteps === 0) record('decode-start', stats(pipeline));
      }
    },
    end(phase, pipeline) {
      if (started === null || settled) return;
      if (phase === 'prefill') {
        record('prefill-end', { durationMs: prefillStarted === null ? null : Math.max(0, Math.round(now() - prefillStarted)), ...stats(pipeline) });
      } else {
        decodedSteps++;
        record('decode-end', { decodedSteps, durationMs: decodeStarted === null ? null : Math.max(0, Math.round(now() - decodeStarted)), ...stats(pipeline) });
      }
    },
  };
}

/** Missing observer hooks or observer failures do not replace the real worker's result/error. */
export function noteWriteTimingWorker(phase, text, error, host = globalThis) {
  try { Reflect.get(host, '__tg2WriteTiming')?.worker(phase, text, error); }
  catch { /* Separate evidence validation fails closed; the original write still settles. */ }
}

/** A completed timing trace is not a numerical, literary, or archive-admission pass. */
export function isCompleteWriteTiming(records) {
  const phases = new Set(['write-start', 'reset-start', 'reset-end', 'create-start', 'create-end',
    'prefill-start', 'prefill-end', 'decode-start', 'decode-end', 'partial-text',
    'interrupt-start', 'interrupt-return', 'stream-drained', 'write-success']);
  if (!Array.isArray(records) || records.length < 9 || records.length > 128
    || !records.every((r, i) => r?.kind === 'write-timing' && r.sequence === i + 1 && phases.has(r.phase)
      && Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0 && (i === 0 || r.elapsedMs >= records[i - 1].elapsedMs)
      && !Object.hasOwn(r, 'error'))) return false;
  const one = phase => records.filter(r => r.phase === phase);
  const ordered = ['write-start', 'reset-start', 'reset-end', 'create-start', 'create-end',
    'prefill-start', 'prefill-end', 'stream-drained', 'write-success'];
  if (ordered.some(phase => one(phase).length !== 1)
    || !ordered.every((phase, i) => i === 0 || one(phase)[0].sequence > one(ordered[i - 1])[0].sequence)
    || records[0].phase !== 'write-start' || records.at(-1).phase !== 'write-success') return false;
  const final = records.at(-1), prefill = one('prefill-end')[0], drained = one('stream-drained')[0];
  const decodes = one('decode-end'), partials = records.filter(r => r.phase === 'partial-text' || r.phase === 'stream-drained');
  const native = r => Number.isSafeInteger(r.prefillTokens) && r.prefillTokens > 0
    && Number.isFinite(r.prefillMs) && r.prefillMs >= 0
    && Number.isSafeInteger(r.decodeTokens) && r.decodeTokens >= 0
    && Number.isFinite(r.decodeMs) && r.decodeMs >= 0
    && Number.isFinite(r.durationMs) && r.durationMs >= 0;
  if (final.droppedEvents !== 0 || final.decodedSteps !== decodes.length || !native(prefill)
    || !Number.isSafeInteger(final.textChunks) || final.textChunks < 1 || drained.textChunks !== final.textChunks
    || !partials.every(r => r.partial === true && typeof r.partialText === 'string' && r.partialText.length <= 3000
      && typeof r.partialTextTruncated === 'boolean' && Number.isSafeInteger(r.textChunks) && r.textChunks >= 1
      && r.textChunks <= final.textChunks)
    || !decodes.every((r, i) => native(r) && r.decodedSteps === i + 1 && r.decodeTokens === i + 1
      && r.sequence > prefill.sequence && r.sequence < drained.sequence
      && (i === 0 || r.decodeMs >= decodes[i - 1].decodeMs))) return false;
  const starts = one('decode-start');
  if (starts.length !== (decodes.length > 0 ? 1 : 0)
    || (starts.length && !(starts[0].sequence > prefill.sequence && starts[0].sequence < decodes[0].sequence))) return false;
  const interrupt = one('interrupt-start'), returned = one('interrupt-return');
  return interrupt.length === returned.length && interrupt.length <= 1
    && (interrupt.length === 0 || (interrupt[0].sequence > prefill.sequence
      && returned[0].sequence > interrupt[0].sequence && returned[0].sequence < drained.sequence));
}

export function instrumentWriteTimingRuntime(source) {
  const prefill = 'yield __await(this.prefill(request, pipeline, chatConfig, genConfig));';
  const decode = 'yield __await(this.decode(pipeline, genConfig));';
  if (!source.includes('const __tg2ShaderRepair =') || !source.includes('const __tg2CompleteStory =')
    || !source.includes('const __tg2SubmissionDiagnostics =') || source.includes('__tg2WriteTiming')) {
    throw new Error('Write timing requires the repaired complete-story runtime exactly once');
  }
  for (const marker of [prefill, decode]) {
    if (source.split(marker).length !== 2) throw new Error('Write timing runtime source no longer matches');
  }
  const setup = `const __tg2WriteTiming = (${createWriteTimingDiagnostics.toString()})(undefined, undefined,
  () => __tg2SubmissionDiagnostics.snapshot().encodedDispatches);
if (Reflect.has(globalThis, '__tg2WriteTiming')) throw new Error('Write timing runtime hook already exists');
Reflect.set(globalThis, '__tg2WriteTiming', __tg2WriteTiming);
`;
  return setup + source
    .replace(prefill, '__tg2WriteTiming.begin("prefill", pipeline);\n                ' + prefill + '\n                __tg2WriteTiming.end("prefill", pipeline);')
    .replace(decode, '__tg2WriteTiming.begin("decode", pipeline);\n                    ' + decode + '\n                    __tg2WriteTiming.end("decode", pipeline);');
}

export function instrumentWriteTimingWorker(source) {
  const markers = [
    'const text = await write(readMessages(request.messages));',
    'while (true) {\n    await model.resetChat(false, creativeWriterModelId);',
    'const chunks = await model.chat.completions.create(',
    'for await (const chunk of chunks) {',
    'text += chunk.choices[0]?.delta.content ?? "";',
    'try { await model.interruptGenerate(); }',
    'catch (error) { interruptionError = error instanceof Error ? error : new Error("Could not interrupt the writer"); }',
    'if (interruptionError !== null) throw interruptionError;',
    '__tg2FinishCompleteStoryWorker(true);',
    'if (request.type === "write") __tg2FinishCompleteStoryWorker(false, error);',
  ];
  if (!source.includes('const stripEmptyThinkingHeader =') || !source.includes('const __tg2FinishCompleteStoryWorker =')
    || source.includes('__tg2NoteWriteTiming')) throw new Error('Write timing requires the adapted complete-story worker exactly once');
  for (const marker of markers) {
    if (source.split(marker).length !== 2) throw new Error(`Write timing worker source no longer matches: ${marker}`);
  }
  return `const __tg2NoteWriteTiming = ${noteWriteTimingWorker.toString()};\n` + source
    .replace(markers[0], '__tg2NoteWriteTiming("write-start");\n      ' + markers[0])
    .replace(markers[1], 'while (true) {\n    __tg2NoteWriteTiming("reset-start");\n    await model.resetChat(false, creativeWriterModelId);\n    __tg2NoteWriteTiming("reset-end");')
    .replace(markers[2], '__tg2NoteWriteTiming("create-start");\n      ' + markers[2])
    .replace(markers[3], '__tg2NoteWriteTiming("create-end");\n      ' + markers[3])
    .replace(markers[4], markers[4] + '\n          __tg2NoteWriteTiming("chunk", stripEmptyThinkingHeader(text));')
    .replace(markers[5], 'try { __tg2NoteWriteTiming("interrupt-start"); await model.interruptGenerate(); __tg2NoteWriteTiming("interrupt-return"); }')
    .replace(markers[6], 'catch (error) { __tg2NoteWriteTiming("interrupt-error", undefined, error); interruptionError = error instanceof Error ? error : new Error("Could not interrupt the writer"); }')
    .replace(markers[7], '__tg2NoteWriteTiming("stream-drained", stripEmptyThinkingHeader(text));\n      ' + markers[7])
    .replace(markers[8], markers[8] + '\n      __tg2NoteWriteTiming("write-success");')
    .replace(markers[9], 'if (request.type === "write") { __tg2NoteWriteTiming("write-error", undefined, error); __tg2FinishCompleteStoryWorker(false, error); }');
}

export function writeTimingPlugin(repo, runtimePaths) {
  const runtimes = new Set(runtimePaths), worker = resolve(repo, 'src/narrator/creative-writer.worker.ts');
  return { name: 'tg2-isolated-write-timing', enforce: 'pre',
    transform(source, id) {
      const path = id.split('?')[0];
      if (runtimes.has(path)) return { code: instrumentWriteTimingRuntime(source), map: null };
      return path === worker ? { code: instrumentWriteTimingWorker(source), map: null } : null;
    } };
}
