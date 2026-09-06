import { AutoModelForCausalLM, AutoTokenizer, env } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';
env.useBrowserCache = false;
env.backends.onnx.wasm.numThreads = 2;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = '/runtime/';

let tokenizer;
let model;
globalThis.creativeProbe = {
  async load() {
    const started = performance.now();
    tokenizer = await AutoTokenizer.from_pretrained('smollm');
    model = await AutoModelForCausalLM.from_pretrained('smollm', { device: 'wasm', dtype: 'q8' });
    return { loadMs: Math.round(performance.now() - started) };
  },
  async generate({ facts, seed }) {
    const messages = [
      { role: 'system', content: 'You write vivid, restrained fantasy fiction. Write exactly two short sentences about the supplied scene. Keep the stated events true. Add sensory detail and emotional subtext, but no new event, person, item, reward, or combat outcome. Output only the story.' },
      { role: 'user', content: `Scene facts: ${facts}${seed ? `\nCreative direction: ${seed}` : ''}\nWrite the two-sentence scene:` },
    ];
    const inputs = tokenizer.apply_chat_template(messages, { tokenize: true, return_dict: true, add_generation_prompt: true });
    const started = performance.now();
    const output = await model.generate({ ...inputs, max_new_tokens: 64, do_sample: false, repetition_penalty: 1.08 });
    const outputTokens = output.tolist()[0].slice(inputs.input_ids.dims.at(-1));
    return { text: tokenizer.decode(outputTokens, { skip_special_tokens: true }), generationMs: Math.round(performance.now() - started), inputTokens: inputs.input_ids.dims.at(-1), outputTokens: outputTokens.length };
  },
  async dispose() { await model?.dispose(); },
};
