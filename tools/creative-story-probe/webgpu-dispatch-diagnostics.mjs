/** Captures only two explicitly labeled synchronous softmax calls, never all model kernels. */
export function createDispatchDiagnostics(
  emit = record => console.debug('TG2_DISPATCH_DIAGNOSTIC ' + JSON.stringify(record)),
  hash = async source => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(source))), byte => byte.toString(16).padStart(2, '0')).join(''),
) {
  const labels = new Set(), pending = [], identities = new WeakMap();
  let active = null, nextIdentity = 1;
  const number = value => Number.isFinite(value) ? value : String(value).slice(0, 100);
  const identity = buffer => {
    if (!identities.has(buffer)) identities.set(buffer, nextIdentity++);
    return identities.get(buffer);
  };
  const queue = (record, scope, code) => {
    const promise = (async () => {
      if (code !== undefined) {
        try {
          if (code.length > 1_000_000) throw new Error('WGSL exceeds the bounded hashing limit');
          record.wgslSha256 = await hash(code);
        } catch (error) { record.wgslHashError = String(error).slice(0, 300); }
      } else await Promise.resolve();
      record.scopeObservedDispatches = scope.observed;
      record.scopeRecordedDispatches = scope.recorded;
      record.scopeTruncated = scope.observed > scope.recorded;
      record.scopeCallError = scope.error;
      emit(record);
    })();
    // Keep observer errors from becoming unhandled before the explicit flush.
    void promise.catch(() => {});
    pending.push(promise);
  };
  const capture = (frame, skippedDebugLimit) => {
    if (active === null) return;
    const scope = active;
    scope.observed++;
    if (scope.recorded >= 8) return;
    const record = { kind: 'softmax-shader-dispatch', label: scope.label, dispatch: ++scope.recorded,
      stage: skippedDebugLimit ? 'skipped-debug-limit' : 'encoded', skippedDebugLimit,
      diagnosticError: null };
    let code;
    try {
      const { context, finfo, args, bufferArgIndices, podArgIndices, dispatchToDim, paramWriteAccess } = frame;
      code = String(frame.code);
      record.name = String(finfo.name).slice(0, 200);
      record.wgsl = code.slice(0, 262144);
      record.wgslCharacters = code.length;
      record.wgslTruncated = code.length > 262144;
      record.wgslHashAlgorithm = 'SHA-256';
      record.argumentTypes = finfo.arg_types.slice(0, 64);
      record.launchTags = finfo.launch_param_tags.slice(0, 32);
      record.shaderSubmitCounter = context.shaderSubmitCounter;
      record.debugShaderSubmitLimit = context.debugShaderSubmitLimit;
      const base = bufferArgIndices.length + podArgIndices.length;
      record.requestedLaunch = dispatchToDim.slice(0, 6).map((dimension, index) => ({ dimension, value: number(args[base + index]) }));
      record.workDim = frame.workDim ? frame.workDim.slice(0, 6).map(number) : null;
      record.packDimX = frame.packDimX === undefined ? null : number(frame.packDimX);
      record.scalars = podArgIndices.slice(0, 32).map((argumentIndex, index) => ({ argumentIndex,
        dtype: finfo.arg_types[argumentIndex], input: number(args[argumentIndex]),
        uniformBits: frame.u32View ? frame.u32View[index] : null,
        uniformI32: frame.i32View ? frame.i32View[index] : null,
        uniformF32: frame.f32View ? number(frame.f32View[index]) : null }));
      record.uniformWords = frame.u32View ? Array.from(frame.u32View.subarray(0, 33)) : null;
      const entries = frame.bindGroupEntries ?? bufferArgIndices.map((argumentIndex, binding) => ({ binding,
        resource: { buffer: context.gpuBufferFromPtr(args[argumentIndex]) } }));
      record.bindings = entries.slice(0, 33).map(({ binding, resource }) => {
        const uniform = binding === bufferArgIndices.length;
        const offset = resource.offset ?? 0;
        return { binding, kind: uniform ? 'uniform' : 'storage', bufferIdentity: identity(resource.buffer),
          pointer: uniform ? null : number(args[bufferArgIndices[binding]]),
          backingBytes: resource.buffer.size, offset, boundBytes: resource.size ?? resource.buffer.size - offset,
          explicitSize: resource.size !== undefined, usage: resource.buffer.usage,
          writable: uniform ? false : Boolean(paramWriteAccess[binding]) };
      });
      record.metadataTruncated = finfo.arg_types.length > 64 || finfo.launch_param_tags.length > 32
        || podArgIndices.length > 32 || entries.length > 33;
    } catch (error) { record.diagnosticError = String(error).slice(0, 500); }
    queue(record, scope, code);
  };
  return {
    run(label, operation, eligible = true) {
      if (!eligible || !['live', 'fresh'].includes(label) || labels.has(label) || active !== null) return operation();
      labels.add(label);
      const scope = { label, observed: 0, recorded: 0, error: null };
      active = scope;
      try { return operation(); }
      catch (error) { scope.error = String(error).slice(0, 500); throw error; }
      finally {
        active = null;
        if (scope.observed === 0) queue({ kind: 'softmax-call-without-dispatch', label }, scope);
      }
    },
    encoded: frame => capture(frame, false),
    skipped: frame => capture(frame, true),
    async flush() { await Promise.all(pending); },
  };
}

/** Must follow default sampling and model-buffer transforms on the exact pinned runtime. */
export function instrumentDispatchRuntime(source) {
  const live = 'let probs = this.fsoftmaxWithTemperature(logitsOnGPU.view([numSeqs, numProbs, this.fullVocabSize]), temperaturesDevice);';
  const fresh = 'const freshProbs = own(pipeline.fsoftmaxWithTemperature(freshInput, freshTemperature));';
  const skip = 'this.shaderSubmitCounter >= this.debugShaderSubmitLimit) {';
  const dispatch = 'compute.dispatchWorkgroups(workDim[0], workDim[1], workDim[2]);';
  const report = 'emit(report);';
  if (!source.includes('const __tg2ModelBuffer =') || !source.includes('const __tg2SamplingDiagnostics =')
    || source.includes('__tg2Dispatch') || source.includes('__tg2BeforeSortingCPU')) throw new Error('Dispatch diagnostic requires the model-buffer transform exactly once');
  for (const marker of [live, fresh, skip, dispatch, report]) {
    if (source.split(marker).length - 1 !== 1) throw new Error(`Dispatch diagnostic source no longer matches: ${marker}`);
  }
  const frame = 'context: this, finfo, code, args, bufferArgIndices, podArgIndices, dispatchToDim, paramWriteAccess';
  return `const __tg2Dispatch = (${createDispatchDiagnostics.toString()})();\n` + source
    .replace(live, `let probs = __tg2Dispatch.run('live', () => this.fsoftmaxWithTemperature(logitsOnGPU.view([numSeqs, numProbs, this.fullVocabSize]), temperaturesDevice), genConfig?.enable_thinking === false && genConfig.max_tokens === 68);`)
    .replace(fresh, "const freshProbs = own(__tg2Dispatch.run('fresh', () => pipeline.fsoftmaxWithTemperature(freshInput, freshTemperature)));")
    .replace(skip, skip + '\n                        __tg2Dispatch.skipped({ ' + frame + ' });')
    .replace(dispatch, dispatch + '\n                    __tg2Dispatch.encoded({ ' + frame + ', workDim, packDimX, bindGroupEntries, i32View, u32View, f32View });')
    // Wait for source hashes before the completed first-token report can stop the runner.
    .replace(report, 'await __tg2Dispatch.flush();\n    ' + report);
}

export function dispatchDiagnosticPlugin(paths) {
  const allowed = new Set(paths);
  return { name: 'tg2-isolated-softmax-dispatch-diagnostic', enforce: 'pre',
    transform(source, id) {
      return allowed.has(id.split('?')[0]) ? { code: instrumentDispatchRuntime(source), map: null } : null;
    } };
}
