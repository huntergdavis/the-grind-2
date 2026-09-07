import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayMode } from "./play-mode-preferences";
import { createPlayModeStartup } from "./play-mode-startup";

type Dependencies = Parameters<typeof createPlayModeStartup>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<Dependencies> = {}) {
  const deps = {
    readMode: vi.fn((): PlayMode | null => "llm"),
    writeMode: vi.fn((_mode: PlayMode) => {}),
    hasCachedModel: vi.fn(async () => true),
    applyMode: vi.fn((_mode: PlayMode) => {}),
    showChoice: vi.fn((_cached: boolean) => {}),
    onHold: vi.fn((_held: boolean) => {}),
    ...overrides,
  };
  return { deps, startup: createPlayModeStartup(deps) };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("play-mode startup coordination", () => {
  it("restores a returning LLM choice only after verifying a complete cache, without rewriting it", async () => {
    const { deps, startup } = setup();
    await startup.start(false);
    expect(deps.hasCachedModel).toHaveBeenCalledOnce();
    expect(deps.applyMode).toHaveBeenCalledExactlyOnceWith("llm", true);
    expect(deps.writeMode).not.toHaveBeenCalled();
    expect(deps.showChoice).not.toHaveBeenCalled();
    expect(deps.onHold).toHaveBeenNthCalledWith(1, true);
    expect(deps.onHold).toHaveBeenNthCalledWith(2, false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts a returning deterministic choice immediately without probing the model cache", async () => {
    const { deps, startup } = setup({ readMode: vi.fn((): PlayMode => "deterministic") });
    const finished = startup.start(false);
    expect(deps.applyMode).toHaveBeenCalledExactlyOnceWith("deterministic");
    expect(deps.hasCachedModel).not.toHaveBeenCalled();
    expect(deps.writeMode).not.toHaveBeenCalled();
    expect(deps.showChoice).not.toHaveBeenCalled();
    expect(deps.onHold).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
    await finished;
  });

  it("offers a choice and keeps the hold when a returning LLM cache is missing", async () => {
    const { deps, startup } = setup({ hasCachedModel: vi.fn(async () => false) });
    await startup.start(false);
    expect(deps.showChoice).toHaveBeenCalledExactlyOnceWith(false);
    expect(deps.applyMode).not.toHaveBeenCalled();
    expect(deps.writeMode).not.toHaveBeenCalled();
    expect(deps.onHold).toHaveBeenCalledExactlyOnceWith(true);
  });

  it.each([null, "llm", "deterministic"] as const)("requires a fresh-start choice despite remembered mode %s", async (mode) => {
    const { deps, startup } = setup({ readMode: vi.fn(() => mode) });
    await startup.start(true);
    expect(deps.hasCachedModel).toHaveBeenCalledOnce();
    expect(deps.showChoice).toHaveBeenCalledExactlyOnceWith(true);
    expect(deps.applyMode).not.toHaveBeenCalled();
    expect(deps.writeMode).not.toHaveBeenCalled();
    expect(deps.onHold).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("does not treat a returning user without a saved mode as having given consent", async () => {
    const { deps, startup } = setup({ readMode: vi.fn(() => null) });
    await startup.start(false);
    expect(deps.showChoice).toHaveBeenCalledExactlyOnceWith(true);
    expect(deps.applyMode).not.toHaveBeenCalled();
  });

  it.each(["throw", "reject"] as const)("offers a choice after a cache-check %s and clears its timer", async (failure) => {
    const hasCachedModel = vi.fn((): Promise<boolean> => {
      if (failure === "throw") throw Error("Cache unavailable");
      return Promise.reject(Error("Cache unavailable"));
    });
    const { deps, startup } = setup({ hasCachedModel });
    await startup.start(false);
    expect(deps.showChoice).toHaveBeenCalledExactlyOnceWith(false);
    expect(deps.applyMode).not.toHaveBeenCalled();
    expect(deps.onHold).toHaveBeenLastCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("treats a failed preference read as missing consent", async () => {
    const { deps, startup } = setup({ readMode: vi.fn(() => { throw Error("Storage blocked"); }) });
    await startup.start(false);
    expect(deps.showChoice).toHaveBeenCalledExactlyOnceWith(true);
    expect(deps.applyMode).not.toHaveBeenCalled();
  });

  it("bounds the default cache wait to two seconds and ignores a later successful result", async () => {
    const cache = deferred<boolean>();
    const { deps, startup } = setup({ hasCachedModel: vi.fn(() => cache.promise) });
    const finished = startup.start(false);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(deps.showChoice).not.toHaveBeenCalled();
    expect(deps.applyMode).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await finished;
    expect(deps.showChoice).toHaveBeenCalledExactlyOnceWith(false);
    expect(deps.onHold).toHaveBeenLastCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);
    cache.resolve(true);
    await Promise.resolve();
    expect(deps.applyMode).not.toHaveBeenCalled();
    expect(deps.showChoice).toHaveBeenCalledOnce();
  });

  it("honors an injected shorter cache deadline", async () => {
    const { deps, startup } = setup({ hasCachedModel: vi.fn(() => new Promise<boolean>(() => {})), cacheCheckTimeoutMs: 25 });
    const finished = startup.start(false);
    await vi.advanceTimersByTimeAsync(25);
    await finished;
    expect(deps.showChoice).toHaveBeenCalledExactlyOnceWith(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets an explicit no-LLM choice win immediately over a pending cache result", async () => {
    const cache = deferred<boolean>();
    const { deps, startup } = setup({ hasCachedModel: vi.fn(() => cache.promise) });
    const finished = startup.start(false);
    startup.choose("deterministic");
    await finished;
    expect(deps.writeMode).toHaveBeenCalledExactlyOnceWith("deterministic");
    expect(deps.applyMode).toHaveBeenCalledExactlyOnceWith("deterministic");
    expect(deps.onHold).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
    cache.resolve(true);
    await Promise.resolve();
    expect(deps.applyMode).toHaveBeenCalledOnce();
    expect(deps.showChoice).not.toHaveBeenCalled();
  });

  it("cancels a pending startup immediately without persisting or applying anything", async () => {
    const cache = deferred<boolean>();
    const { deps, startup } = setup({ hasCachedModel: vi.fn(() => cache.promise) });
    const finished = startup.start(false);
    startup.cancel();
    await finished;
    expect(deps.onHold).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0);
    cache.reject(Error("Late cache failure"));
    await Promise.resolve();
    expect(deps.writeMode).not.toHaveBeenCalled();
    expect(deps.applyMode).not.toHaveBeenCalled();
    expect(deps.showChoice).not.toHaveBeenCalled();
  });

  it("ignores an older overlapping start without releasing the newer choice hold", async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const hasCachedModel = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { deps, startup } = setup({ hasCachedModel });
    const older = startup.start(false);
    const newer = startup.start(true);
    await older;
    expect(vi.getTimerCount()).toBe(1);
    first.resolve(true);
    await Promise.resolve();
    expect(deps.applyMode).not.toHaveBeenCalled();
    expect(deps.showChoice).not.toHaveBeenCalled();
    second.resolve(false);
    await newer;
    expect(deps.showChoice).toHaveBeenCalledExactlyOnceWith(false);
    expect(deps.onHold).toHaveBeenCalledTimes(2);
    expect(deps.onHold).toHaveBeenLastCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("persists and applies one explicit choice, then releases the choice hold", async () => {
    const { deps, startup } = setup({ readMode: vi.fn(() => null) });
    await startup.start(true);
    startup.choose("llm");
    expect(deps.writeMode).toHaveBeenCalledExactlyOnceWith("llm");
    expect(deps.applyMode).toHaveBeenCalledExactlyOnceWith("llm");
    expect(deps.onHold).toHaveBeenLastCalledWith(false);
  });

  it("still applies an explicit choice when persistence fails", () => {
    const { deps, startup } = setup({ writeMode: vi.fn(() => { throw Error("Storage full"); }) });
    expect(() => startup.choose("deterministic")).not.toThrow();
    expect(deps.applyMode).toHaveBeenCalledExactlyOnceWith("deterministic");
    expect(deps.onHold).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("does not let an old apply callback release a re-entrant newer startup hold", async () => {
    const cache = deferred<boolean>();
    let startup!: ReturnType<typeof createPlayModeStartup>;
    const deps = {
      readMode: vi.fn((): PlayMode | null => "llm"), writeMode: vi.fn(),
      hasCachedModel: vi.fn(() => cache.promise), showChoice: vi.fn(), onHold: vi.fn(),
      applyMode: vi.fn(() => { void startup.start(true); }),
    };
    startup = createPlayModeStartup(deps);
    startup.choose("deterministic");
    expect(deps.onHold).toHaveBeenCalledExactlyOnceWith(true);
    cache.resolve(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.showChoice).toHaveBeenCalledExactlyOnceWith(false);
    expect(deps.onHold).not.toHaveBeenCalledWith(false);
    startup.cancel();
  });
});
