import {
  isWorkerResponseForRequest,
  type SharedModelCompatibilityWorkerRequestV1,
  type SharedModelCompatibilityWorkerResponseV1,
} from "./protocol";

export interface SharedModelCompatibilityWorkerPort {
  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: (event: unknown) => void,
  ): void;
  removeEventListener(
    type: "message" | "error" | "messageerror",
    listener: (event: unknown) => void,
  ): void;
  postMessage(
    message: SharedModelCompatibilityWorkerRequestV1,
    transfer: readonly Transferable[],
  ): void;
}

export interface SharedModelCompatibilityClock {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserClock: SharedModelCompatibilityClock = Object.freeze({
  setTimeout: (callback: () => void, milliseconds: number) =>
    globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as number),
});

export function requestCompatibilityWorker(
  worker: SharedModelCompatibilityWorkerPort,
  message: SharedModelCompatibilityWorkerRequestV1,
  timeoutMs: number,
  clock: SharedModelCompatibilityClock = browserClock,
): Promise<SharedModelCompatibilityWorkerResponseV1> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: unknown;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clock.clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
      callback();
    };
    const onMessage = (event: unknown): void => {
      const value = typeof event === "object" && event !== null && "data" in event
        ? event.data
        : undefined;
      if (!isWorkerResponseForRequest(value, message)) {
        finish(() => reject(new TypeError(
          "Shared-model compatibility worker returned a stale or malformed response",
        )));
        return;
      }
      finish(() => resolve(value));
    };
    const onError = (): void => finish(() => reject(
      new Error("Shared-model compatibility worker failed"),
    ));
    const onMessageError = (): void => finish(() => reject(
      new Error("Shared-model compatibility worker response could not be cloned"),
    ));
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onMessageError);
    timer = clock.setTimeout(
      () => finish(() => reject(new Error("Shared-model compatibility worker operation timed out"))),
      timeoutMs,
    );
    const transfer: Transferable[] = [];
    if (message.kind === "initialize") {
      for (const artifact of [
        ...message.baselineModelArtifacts,
        ...message.candidateModelArtifacts,
        ...message.runtimeArtifacts,
      ]) transfer.push(artifact.bytes);
    }
    try {
      worker.postMessage(message, transfer);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
