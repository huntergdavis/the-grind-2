import { WebWorkerMLCEngineHandler } from '@tg2-webllm-v1';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event) => handler.onmessage(event);
