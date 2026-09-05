import { describe, expect, it } from "vitest";
import { writeStoryBeatAtStableScene } from "./story-beat-write";

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: () => resolvePromise?.() };
}

describe("stable story-beat scene lease", () => {
  it("does not pause or write for a hidden surface", async () => {
    let pauses = 0;
    let writes = 0;
    const result = await writeStoryBeatAtStableScene(
      {
        snapshot: { visible: false, busy: false },
        write: () => {
          writes += 1;
          return true;
        },
      },
      {
        isPaused: () => false,
        pause: () => {
          pauses += 1;
        },
        waitForStable: () => Promise.resolve(),
      },
    );

    expect(result).toBe(false);
    expect(pauses).toBe(0);
    expect(writes).toBe(0);
  });

  it("pauses before waiting and writes the exact scene that is stable afterward", async () => {
    const stable = deferred();
    let paused = false;
    let writes = 0;
    const controller = {
      snapshot: { visible: true, busy: false },
      write: () => {
        writes += 1;
        return true;
      },
    };
    const pending = writeStoryBeatAtStableScene(controller, {
      isPaused: () => paused,
      pause: () => {
        paused = true;
      },
      waitForStable: () => stable.promise,
    });

    expect(paused).toBe(true);
    expect(writes).toBe(0);
    controller.snapshot = { visible: true, busy: false };
    stable.resolve();

    await expect(pending).resolves.toBe(true);
    expect(writes).toBe(1);
  });

  it("does not write if the player resumes or the surface hides while settling", async () => {
    for (const interruption of ["resume", "hide"] as const) {
      const stable = deferred();
      let paused = false;
      let writes = 0;
      const controller = {
        snapshot: { visible: true, busy: false },
        write: () => {
          writes += 1;
          return true;
        },
      };
      const pending = writeStoryBeatAtStableScene(controller, {
        isPaused: () => paused,
        pause: () => {
          paused = true;
        },
        waitForStable: () => stable.promise,
      });
      if (interruption === "resume") paused = false;
      else controller.snapshot = { visible: false, busy: false };
      stable.resolve();

      await expect(pending).resolves.toBe(false);
      expect(writes).toBe(0);
    }
  });

  it("reuses an existing pause without toggling it", async () => {
    let pauses = 0;
    const result = await writeStoryBeatAtStableScene(
      {
        snapshot: { visible: true, busy: false },
        write: () => true,
      },
      {
        isPaused: () => true,
        pause: () => {
          pauses += 1;
        },
        waitForStable: () => Promise.resolve(),
      },
    );

    expect(result).toBe(true);
    expect(pauses).toBe(0);
  });
});
