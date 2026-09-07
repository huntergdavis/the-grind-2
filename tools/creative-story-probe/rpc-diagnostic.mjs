export const rpcBudgets = Object.freeze({ totalMs: 110000, loadMs: 65000, writeMs: 20000, cleanupMs: 5000 });

export async function observeDebugRoundTrip(writer, clock = () => performance.now()) {
  const started = clock();
  try {
    const info = await writer._getDebugInfo();
    return { status: 'resolved', durationMs: clock() - started, info };
  } catch (error) {
    // The pinned 3.6.1 native debug endpoint is a null stub, not valid JSON.
    return { status: 'rejected', durationMs: clock() - started, error: String(error?.message ?? error).slice(0, 500) };
  }
}

/** Probe-only observation of the pinned runtime's ordinary JS properties. */
export function observeRpc(proxy, { clock = () => performance.now(), emit = () => {} } = {}) {
  const original = proxy.wllamaAction;
  if (typeof original !== 'function') throw new Error('Pinned runtime RPC method unavailable');
  const state = { calls: 0, events: [], workerErrors: [], workerErrorCount: 0 };
  const snapshot = () => structuredClone(state);
  const publish = () => {
    try { void Promise.resolve(emit(snapshot())).catch(() => {}); } catch { /* Observer has no inference authority. */ }
  };
  const errorHandler = event => {
    state.workerErrorCount++;
    if (state.workerErrors.length < 8) state.workerErrors.push({ type: event.type, atMs: clock(), message: String(event.message ?? '').slice(0, 500) });
    if (state.workerErrorCount <= 8) publish();
  };
  proxy.worker?.addEventListener('error', errorHandler);
  proxy.worker?.addEventListener('messageerror', errorHandler);
  const wrapped = async function(name, ...args) {
    if (name !== 'completion' && name !== 'get_result') return original.call(this, name, ...args);
    const event = { id: ++state.calls, action: name, reqId: args[0]?.req_id ?? null, startedMs: clock(), status: 'pending' };
    if (state.events.length >= 32) state.events.splice(16, 1);
    state.events.push(event);
    const publishThis = state.calls <= 16 || (state.calls & (state.calls - 1)) === 0;
    if (publishThis) publish();
    try {
      const result = await original.call(this, name, ...args);
      event.status = 'resolved'; event.finishedMs = clock(); event.durationMs = event.finishedMs - event.startedMs;
      event.result = name === 'completion' ? { success: result?.success, reqId: result?.req_id } : {
        hasMore: result?.has_more, isError: result?.is_error,
        dataBytes: typeof result?.data_json === 'string' ? new TextEncoder().encode(result.data_json).length : null,
        dataKind: result?.data_json === '' ? 'empty' : result?.data_json === 'null' ? 'null' : typeof result?.data_json === 'string' ? 'nonempty' : 'missing',
      };
      if (publishThis) publish();
      return result;
    } catch (error) {
      event.status = 'rejected'; event.finishedMs = clock(); event.durationMs = event.finishedMs - event.startedMs;
      event.error = String(error?.message ?? error).slice(0, 500); publish(); throw error;
    }
  };
  proxy.wllamaAction = wrapped;
  return { snapshot, dispose() {
    if (proxy.wllamaAction === wrapped) proxy.wllamaAction = original;
    proxy.worker?.removeEventListener('error', errorHandler);
    proxy.worker?.removeEventListener('messageerror', errorHandler);
  } };
}
