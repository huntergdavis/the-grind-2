import {
  isWorkerResponseForRequest,
  type BrowserStoryBeatWorkerRequestV1,
  type BrowserStoryBeatWorkerResponseV1,
} from "./protocol";

export interface StoryBeatWorkerChannelPort {
  addEventListener(type: "message" | "error" | "messageerror", listener: (event: unknown) => void): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: (event: unknown) => void): void;
  postMessage(message: BrowserStoryBeatWorkerRequestV1, transfer: readonly Transferable[]): void;
}

export interface StoryBeatWorkerChannelClock {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserClock: StoryBeatWorkerChannelClock = Object.freeze({
  setTimeout: (callback: () => void, milliseconds: number) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as number),
});

export function requestStoryBeatWorker(
  activeWorker: StoryBeatWorkerChannelPort,
  message: BrowserStoryBeatWorkerRequestV1,
  timeoutMs: number,
  clock: StoryBeatWorkerChannelClock = browserClock,
): Promise<BrowserStoryBeatWorkerResponseV1> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: unknown;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clock.clearTimeout(timer);
      activeWorker.removeEventListener("message", onMessage);
      activeWorker.removeEventListener("error", onError);
      activeWorker.removeEventListener("messageerror", onMessageError);
      callback();
    };
    const onMessage = (event: unknown): void => {
      const value = typeof event === "object" && event !== null && "data" in event
        ? event.data
        : undefined;
      if (!isWorkerResponseForRequest(value, message)) {
        finish(() => reject(new TypeError("Story-beat worker returned a stale or malformed response")));
        return;
      }
      finish(() => resolve(value));
    };
    const onError = (): void => finish(() => reject(new Error("Story-beat worker failed")));
    const onMessageError = (): void => finish(() => reject(new Error("Story-beat worker response could not be cloned")));
    activeWorker.addEventListener("message", onMessage);
    activeWorker.addEventListener("error", onError);
    activeWorker.addEventListener("messageerror", onMessageError);
    timer = clock.setTimeout(
      () => finish(() => reject(new Error("Story-beat worker operation timed out"))),
      timeoutMs,
    );
    const transfer: Transferable[] = [];
    if (message.kind === "initialize") {
      transfer.push(message.holdoutBytes);
      for (const artifact of [...message.modelArtifacts, ...message.runtimeArtifacts]) transfer.push(artifact.bytes);
    }
    try {
      activeWorker.postMessage(message, transfer);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
