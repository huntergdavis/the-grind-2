import test from 'node:test';
import assert from 'node:assert/strict';
import { observeRpc, observeDebugRoundTrip, rpcBudgets } from './rpc-diagnostic.mjs';

test('records exact completion and result timings without changing receiver, arguments or returned object', async () => {
  let now = 10;
  const body = { _name: 'cmpl_req', data_json: 'private prompt' };
  const response = { success: true, req_id: 7 };
  const proxy = { async wllamaAction(name, input) {
    assert.equal(this, proxy); assert.equal(name, 'completion'); assert.equal(input, body);
    now = 25; return response;
  } };
  const original = proxy.wllamaAction;
  const trace = observeRpc(proxy, { clock: () => now });
  assert.equal(await proxy.wllamaAction('completion', body), response);
  const state = trace.snapshot();
  assert.equal(state.events[0].durationMs, 15);
  assert.equal(state.events[0].result.reqId, 7);
  assert.equal(state.events[0].status, 'resolved');
  assert.doesNotMatch(JSON.stringify(state), /private prompt/);
  trace.dispose(); assert.equal(proxy.wllamaAction, original);
});

test('pending and rejected calls stay observable and preserve rejection identity', async () => {
  let reject;
  const failure = new Error('fixture failure');
  const proxy = { wllamaAction() { return new Promise((_, no) => { reject = no; }); } };
  const trace = observeRpc(proxy, { clock: () => 12 });
  const promise = proxy.wllamaAction('get_result', { req_id: 3 });
  assert.equal(trace.snapshot().events[0].status, 'pending');
  reject(failure);
  await assert.rejects(promise, error => error === failure);
  assert.equal(trace.snapshot().events[0].status, 'rejected');
  assert.equal(trace.snapshot().events[0].error, 'fixture failure');
});

test('classifies UTF-8 response size, null and empty without dropping native results', async () => {
  for (const [data, bytes, kind] of [['', 0, 'empty'], ['null', 4, 'null'], ['é', 2, 'nonempty']]) {
    const response = { has_more: true, is_error: false, data_json: data };
    const proxy = { async wllamaAction() { return response; } };
    const trace = observeRpc(proxy);
    assert.equal(await proxy.wllamaAction('get_result', { req_id: 4 }), response);
    assert.deepEqual(trace.snapshot().events[0].result, { hasMore: true, isError: false, dataBytes: bytes, dataKind: kind });
  }
});

test('bounds retained events and worker errors while counting all observations', async () => {
  const worker = new EventTarget();
  const proxy = { worker, async wllamaAction() { return { data_json: '', has_more: true }; } };
  const trace = observeRpc(proxy);
  for (let i = 0; i < 90; i++) await proxy.wllamaAction('get_result', { req_id: 1 });
  for (let i = 0; i < 20; i++) worker.dispatchEvent(new Event('messageerror'));
  const state = trace.snapshot();
  assert.equal(state.calls, 90); assert.equal(state.events.length, 32);
  assert.equal(state.events[0].id, 1); assert.equal(state.events.at(-1).id, 90);
  assert.equal(state.workerErrors.length, 8); assert.equal(state.workerErrorCount, 20);
  trace.dispose(); worker.dispatchEvent(new Event('messageerror'));
  assert.equal(trace.snapshot().workerErrorCount, 20);
});

test('unrelated actions and observer failures cannot alter inference', async () => {
  const response = {};
  const proxy = { async wllamaAction() { return response; } };
  const trace = observeRpc(proxy, { emit: () => { throw new Error('observer failure'); } });
  assert.equal(await proxy.wllamaAction('load', {}), response);
  assert.equal(trace.snapshot().calls, 0);
  assert.equal(await proxy.wllamaAction('completion', {}), response);
  assert.equal(trace.snapshot().calls, 1);
});

test('diagnostic makes room for cleanup within a 110-second total and only 20 seconds of generation', () => {
  assert.equal(rpcBudgets.totalMs, 110000);
  assert.equal(rpcBudgets.writeMs, 20000);
  assert.ok(rpcBudgets.loadMs + rpcBudgets.writeMs + rpcBudgets.cleanupMs < rpcBudgets.totalMs);
});

test('unimplemented native debug response is recorded once without preventing completion observation', async () => {
  let calls = 0;
  const writer = { async _getDebugInfo() { calls++; throw new SyntaxError('Unexpected end of JSON input'); } };
  const result = await observeDebugRoundTrip(writer, () => 12);
  assert.equal(calls, 1); assert.equal(result.status, 'rejected');
  assert.equal(result.error, 'Unexpected end of JSON input');
  assert.equal(result.durationMs, 0);
  const info = { fixture: true };
  const success = await observeDebugRoundTrip({ async _getDebugInfo() { return info; } });
  assert.equal(success.status, 'resolved'); assert.equal(success.info, info);
});
