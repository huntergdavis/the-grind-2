import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SHADER_REPAIR_RECEIPT = new URL('./webgpu-candidate-report-2026-09-09T04-39-55-729Z-d474de03.json', import.meta.url);
const OUTPUT_NAME = 'softmax_with_chunked_sum_kernel';
const OUTPUT_SHA = 'd8644541fd33534e87638eebc266a32cf80c6bba026f50fc7a97ec74643e0de4';
const CHUNK_SHA = '180eed67a3f02a415a3e55dc75fd3cdf5a429ce9f60affd230964fee321ead34';
const sha256 = source => createHash('sha256').update(source).digest('hex');

/** The receipt is existing evidence, not a generated replacement shader or a broad text patch. */
export function readShaderRepairPin(receipt = JSON.parse(readFileSync(SHADER_REPAIR_RECEIPT, 'utf8'))) {
  const records = receipt.dispatchObservations;
  if (!Array.isArray(records) || records.length !== 4) throw new Error('Shader repair receipt requires the four pinned live/fresh dispatches');
  let original;
  for (const label of ['live', 'fresh']) {
    for (const [name, hash] of [[OUTPUT_NAME, OUTPUT_SHA], ['chunk_lse_kernel', CHUNK_SHA]]) {
      const matching = records.filter(record => record.label === label && record.name === name);
      const record = matching[0];
      if (matching.length !== 1 || typeof record?.wgsl !== 'string' || record.wgslTruncated !== false
        || record.wgslSha256 !== hash || sha256(record.wgsl) !== hash) {
        throw new Error('Shader repair receipt no longer matches the pinned WGSL');
      }
      if (name === OUTPUT_NAME) original = record.wgsl;
    }
  }
  let repaired = original;
  for (const assignment of ['temp_max_shared[0i] = red_buf0[(i32(threadIdx.y) * 32i)];',
    'temp_sum_shared[0i] = red_buf0_1[(i32(threadIdx.y) * 32i)];']) {
    const guard = 'if (i32(threadIdx.x) == 0i) {\n    ' + assignment;
    if (repaired.split(guard).length !== 2) throw new Error('Shader repair scalar guard no longer matches exactly once');
    repaired = repaired.replace(guard, 'if ((i32(threadIdx.x) == 0i) && (i32(threadIdx.y) == 0i)) {\n    ' + assignment);
  }
  return Object.freeze({ shaderName: OUTPUT_NAME, original, repaired, originalSha256: OUTPUT_SHA,
    repairedSha256: sha256(repaired), unchangedChunkSha256: CHUNK_SHA, guardChanges: 2 });
}

/** Serialized into the isolated worker. No asynchronous work, shader-wide rewriting, or GPU waits. */
export function createShaderRepair(pin,
  emit = record => console.debug('TG2_SHADER_REPAIR ' + JSON.stringify(record))) {
  let targetCompilations = 0;
  return {
    repair(finfo, code) {
      if (finfo?.name !== pin.shaderName) return code;
      if (code !== pin.original) throw new Error('Pinned softmax shader source drift: repair refused');
      if (targetCompilations !== 0) throw new Error('Pinned softmax shader compiled more than once: repair refused');
      targetCompilations++;
      emit(Object.freeze({ kind: 'softmax-scalar-single-writer', stage: 'before-shader-compilation',
        scope: 'one-candidate-worker', sourceMatch: 'exact-pinned-wgsl', shaderName: pin.shaderName,
        originalSha256: pin.originalSha256, repairedSha256: pin.repairedSha256,
        originalCharacters: pin.original.length, repairedCharacters: pin.repaired.length,
        guardChanges: pin.guardChanges, targetCompilations,
        changesShaders: true, changesSampling: false, addsGPUWaits: false }));
      return pin.repaired;
    },
  };
}

/** Provenance alone is insufficient: the actual first live/fresh dispatches must use the repaired shader. */
export function isCompleteShaderRepairEvidence(report) {
  const pin = readShaderRepairPin(), observations = report?.shaderRepairObservations;
  if (!Array.isArray(observations) || observations.length !== 1) return false;
  const record = observations[0];
  if (record?.kind !== 'softmax-scalar-single-writer' || record.stage !== 'before-shader-compilation'
    || record.scope !== 'one-candidate-worker' || record.sourceMatch !== 'exact-pinned-wgsl'
    || record.shaderName !== pin.shaderName || record.originalSha256 !== pin.originalSha256
    || record.repairedSha256 !== pin.repairedSha256 || record.originalCharacters !== pin.original.length
    || record.repairedCharacters !== pin.repaired.length || record.guardChanges !== 2
    || record.targetCompilations !== 1 || record.changesShaders !== true
    || record.changesSampling !== false || record.addsGPUWaits !== false) return false;
  const dispatches = report.dispatchObservations;
  if (!Array.isArray(dispatches) || dispatches.length !== 4) return false;
  for (const label of ['live', 'fresh']) {
    for (const [name, hash] of [[pin.shaderName, pin.repairedSha256], ['chunk_lse_kernel', pin.unchangedChunkSha256]]) {
      const matching = dispatches.filter(dispatch => dispatch?.label === label && dispatch.name === name);
      const dispatch = matching[0];
      if (matching.length !== 1 || dispatch.kind !== 'softmax-shader-dispatch' || dispatch.stage !== 'encoded'
        || dispatch.skippedDebugLimit !== false || dispatch.wgslTruncated !== false
        || dispatch.diagnosticError !== null || dispatch.scopeCallError !== null
        || dispatch.scopeTruncated !== false || dispatch.metadataTruncated !== false
        || typeof dispatch.wgsl !== 'string' || dispatch.wgslSha256 !== hash
        || dispatch.wgslHashAlgorithm !== 'SHA-256' || dispatch.wgslHashError !== undefined
        || dispatch.wgslCharacters !== dispatch.wgsl.length || sha256(dispatch.wgsl) !== hash
        || (name === pin.shaderName && dispatch.wgsl !== pin.repaired)) return false;
    }
  }
  return true;
}

/** Last opt-in transform: preserve compile/dispatch identity by replacing the function's code variable. */
export function instrumentShaderRepairRuntime(source) {
  const compile = 'createShadeInternal(finfo, code, asyncMode) {';
  if (!source.includes('const __tg2CompleteStory =') || !source.includes('const __tg2SubmissionDiagnostics =')
    || !source.includes('const __tg2Dispatch =') || source.includes('__tg2ShaderRepair')) {
    throw new Error('Shader repair requires complete-story instrumentation exactly once');
  }
  for (const marker of [compile, 'const __tg2CompleteStory =', 'const __tg2SubmissionDiagnostics =', 'const __tg2Dispatch =']) {
    if (source.split(marker).length !== 2) throw new Error('Shader repair runtime source no longer matches');
  }
  const pin = readShaderRepairPin();
  return `const __tg2ShaderRepair = (${createShaderRepair.toString()})(${JSON.stringify(pin)});\n` + source
    .replace(compile, compile + '\n            code = __tg2ShaderRepair.repair(finfo, code);');
}

export function shaderRepairPlugin(paths) {
  const allowed = new Set(paths);
  return { name: 'tg2-isolated-pinned-softmax-scalar-repair', enforce: 'pre',
    transform(source, id) {
      return allowed.has(id.split('?')[0]) ? { code: instrumentShaderRepairRuntime(source), map: null } : null;
    } };
}
