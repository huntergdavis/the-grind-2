import { resolve, dirname } from 'node:path';

/** Strip only WebLLM's exact synthetic empty header, never actual reasoning or prose. */
export function stripEmptyThinkingHeader(text) {
  const header = '<think>\n\n</think>\n\n';
  return text.startsWith(header) ? text.slice(header.length) : text;
}

export function adaptCandidateWorker(source) {
  const markers = [
    ['model.chat.completions.create({ model: creativeWriterModelId,', 2],
    ['hasFinishedCreativeStoryPassage(text)', 1],
    ['const result = text.trim();', 1],
    ['result.choices[0]?.message.content === label', 1],
    ['stream: true, max_tokens: 64,', 1],
  ];
  for (const [marker, count] of markers) {
    if (source.split(marker).length - 1 !== count) throw new Error(`Candidate worker adapter no longer matches: ${marker}`);
  }
  return `const stripEmptyThinkingHeader = ${stripEmptyThinkingHeader.toString()};\n` + source
    .replaceAll(markers[0][0], markers[0][0] + ' extra_body: { enable_thinking: false },')
    .replace(markers[1][0], 'hasFinishedCreativeStoryPassage(stripEmptyThinkingHeader(text))')
    .replace(markers[2][0], `console.debug('TG2_CANDIDATE_RAW ' + JSON.stringify({ raw: text }));\n      const result = stripEmptyThinkingHeader(text).trim();`)
    .replace(markers[3][0], 'stripEmptyThinkingHeader(result.choices[0]?.message.content ?? "").trim() === label')
    // WebLLM includes its four synthetic header tokens in max_tokens.
    .replace(markers[4][0], 'stream: true, max_tokens: 68,');
}

/** Only this manual build substitutes the manifest and enables Qwen3's non-thinking mode. */
export function candidateModelPlugin(repo) {
  const manifest = resolve(repo, 'src/narrator/creative-writer-model');
  const worker = resolve(repo, 'src/narrator/creative-writer.worker.ts');
  return {
    name: 'tg2-isolated-qwen3-candidate', enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null;
      const target = resolve(dirname(importer.split('?')[0]), source);
      return target === manifest || target === manifest + '.ts'
        ? resolve(repo, 'tools/creative-story-probe/webgpu-candidate-config.mjs') : null;
    },
    transform(source, id) {
      return id.split('?')[0] === worker ? { code: adaptCandidateWorker(source), map: null } : null;
    },
  };
}
