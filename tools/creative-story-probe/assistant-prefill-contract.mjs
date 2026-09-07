import { instrumentSuccessiveStoryWorker } from './successive-story-contract.mjs';
import { assistantPrefillPrefixes } from './assistant-prefill-cases.mjs';

export const prefillReplacements = Object.freeze([
  ['async function write(messages: CreativeWriterMessage[]): Promise<string> {',
    'async function write(messages: CreativeWriterMessage[], prefix: string): Promise<string> {'],
  ['  const tokenize = () => tokenizer!.apply_chat_template(boundedMessages, {\n    tokenize: true, return_dict: true, add_generation_prompt: true,\n  });',
    '  const tokenize = () => tokenizer!(tokenizer!.apply_chat_template(boundedMessages, {\n    tokenize: false, add_generation_prompt: true,\n  }) + prefix, { add_special_tokens: false });'],
  ['hasFinishedCreativeStoryPassage(activeTokenizer.decode(',
    'hasFinishedCreativeStoryPassage(prefix + activeTokenizer.decode('],
  ['  const text = tokenizer.decode(suffix, { skip_special_tokens: true }).trim();',
    '  const generatedSuffix = tokenizer.decode(suffix, { skip_special_tokens: true });\n  workerScope.postMessage({ type: "probe-suffix", hostPrefix: prefix, generatedSuffix });\n  const text = (prefix + generatedSuffix).trim();'],
  ['      const text = await write(readMessages(request.messages));',
    `      if (typeof request.probePrefix !== "string" || !${JSON.stringify(Object.values(assistantPrefillPrefixes))}.includes(request.probePrefix)) throw new Error("Unexpected trial prefix");\n      const text = await write(readMessages(request.messages), request.probePrefix);`],
]);

/** Trial changes only chat continuation and full-passage stopping/return, never model scores or budgets. */
export function instrumentAssistantPrefillWorker(source) {
  let result = instrumentSuccessiveStoryWorker(source);
  for (const [before, after] of prefillReplacements) {
    if (result.split(before).length !== 2) throw new Error('Assistant prefill source marker missing or ambiguous');
    result = result.replace(before, after);
  }
  return result;
}
