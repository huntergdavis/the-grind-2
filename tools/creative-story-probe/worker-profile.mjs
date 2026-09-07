import { gunzipSync } from 'node:zlib';

/** Dedicated-worker profiling through the browser's target transport. */
export async function attachWorkerProfiler(browser, workerUrl) {
  const session = await browser.newBrowserCDPSession();
  let workerSession;
  const pending = new Map();
  let sequence = 0;
  const receive = event => {
    if (event.sessionId !== workerSession) return;
    const message = JSON.parse(event.message);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Worker CDP ${method} exceeded 2500ms`)); }, 2500);
    pending.set(id, { resolve, reject, timer });
    session.send('Target.sendMessageToTarget', { sessionId: workerSession, message: JSON.stringify({ id, method, params }) })
      .catch(error => { clearTimeout(timer); pending.delete(id); reject(error); });
  });
  const close = async () => {
    session.off('Target.receivedMessageFromTarget', receive);
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Worker profile detached')); }
    pending.clear();
    await session.detach();
  };
  try {
    const { targetInfos } = await session.send('Target.getTargets');
    const targets = targetInfos.filter(target => target.type === 'worker' && target.url === workerUrl);
    if (targets.length !== 1) throw new Error(`Expected one exact worker target; found ${targets.length}`);
    const target = targets[0];
    ({ sessionId: workerSession } = await session.send('Target.attachToTarget', { targetId: target.targetId, flatten: false }));
    session.on('Target.receivedMessageFromTarget', receive);
    await send('Profiler.enable');
    await send('Profiler.setSamplingInterval', { interval: 1000 });
    return { target, send, close,
      start: () => send('Profiler.start'),
      stop: async () => (await send('Profiler.stop')).profile,
    };
  } catch (error) { await close(); throw error; }
}

export function summarizeWorkerProfile(profile) {
  const counts = new Map();
  const byId = new Map(profile.nodes.map(node => [node.id, node]));
  for (const id of profile.samples ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  const frames = [...counts].map(([id, samples]) => ({ samples, ...byId.get(id)?.callFrame }))
    .sort((left, right) => right.samples - left.samples);
  const samples = profile.samples?.length ?? 0;
  const idleSamples = frames.filter(frame => frame.functionName === '(idle)').reduce((total, frame) => total + frame.samples, 0);
  return { durationMs: (profile.endTime - profile.startTime) / 1000, samples, idleSamples,
    nonIdleSamples: samples - idleSamples, topFrames: frames.slice(0, 32) };
}

export function decodeProfileNativeFrames(profile, sourceMap) {
  const encoded = sourceMap.match(/["']?default["']?\s*:\s*["']([^"']+)["']/)?.[1];
  if (!encoded) throw new Error('Pinned default native symbol table missing');
  const data = gunzipSync(Buffer.from(encoded, 'base64'));
  const firstId = data.readUInt32LE(0), count = data.readUInt32LE(4), namesCount = data.readUInt32LE(8);
  const names = []; let offset = 12;
  for (let i = 0; i < namesCount; i++) {
    const length = data[offset++]; names.push(data.subarray(offset, offset + length).toString('utf8')); offset += length;
  }
  return profile.nodes.flatMap(node => {
    const match = node.callFrame.functionName.match(/(?:wasm-function\[|\$func)(\d+)/);
    if (!match) return [];
    const functionId = Number(match[1]), index = functionId - firstId;
    const nameIndex = index >= 0 && index < count ? data.readUInt16LE(offset + index * 2) : 65535;
    return [{ nodeId: node.id, functionId, name: names[nameIndex] ?? '(unknown)', original: node.callFrame.functionName }];
  });
}
