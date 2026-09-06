import { describe, expect, it } from "vitest";
import {
  writeStoryBeatAndContinueAtStableScene,
  writeStoryBeatAtStableScene,
} from "./story-beat-write";

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

  it("resumes only the pause it acquired after local writing settles", async () => {
    const settlement = deferred();
    let paused = false;
    let generation = 0;
    let writes = 0;
    let resumes = 0;
    const controller = {
      snapshot: { visible: true, busy: false },
      write: () => {
        writes += 1;
        controller.snapshot = { visible: true, busy: true };
        return true;
      },
      waitForWriteSettlement: () => settlement.promise,
    };
    const pending = writeStoryBeatAndContinueAtStableScene(controller, {
      isPaused: () => paused,
      pause: () => {
        paused = true;
        generation += 1;
      },
      waitForStable: () => Promise.resolve(),
      pauseGeneration: () => generation,
      canResume: () => true,
      resume: () => {
        resumes += 1;
        paused = false;
        generation += 1;
      },
    });
    await Promise.resolve();

    expect(paused).toBe(true);
    expect(writes).toBe(1);
    expect(resumes).toBe(0);
    settlement.resolve();

    await expect(pending).resolves.toBe(true);
    expect(paused).toBe(false);
    expect(resumes).toBe(1);
  });

  it("never resumes a pre-existing, superseded, resumed, or hidden pause", async () => {
    for (const interruption of [
      "pre-existing",
      "superseded",
      "resumed",
      "hidden",
    ] as const) {
      const settlement = deferred();
      let paused = interruption === "pre-existing";
      let generation = interruption === "pre-existing" ? 4 : 0;
      let canResume = true;
      let resumes = 0;
      const controller = {
        snapshot: { visible: true, busy: false },
        write: () => true,
        waitForWriteSettlement: () => settlement.promise,
      };
      const pending = writeStoryBeatAndContinueAtStableScene(controller, {
        isPaused: () => paused,
        pause: () => {
          paused = true;
          generation += 1;
        },
        waitForStable: () => Promise.resolve(),
        pauseGeneration: () => generation,
        canResume: () => canResume,
        resume: () => {
          resumes += 1;
          paused = false;
          generation += 1;
        },
      });
      await Promise.resolve();
      if (interruption === "superseded") generation += 1;
      if (interruption === "resumed") {
        paused = false;
        generation += 1;
      }
      if (interruption === "hidden") canResume = false;
      settlement.resolve();

      await expect(pending).resolves.toBe(true);
      expect(resumes, interruption).toBe(0);
      expect(paused, interruption).toBe(interruption !== "resumed");
    }
  });

  it("releases its current pause when stable dispatch becomes ineligible", async () => {
    const stable = deferred();
    let paused = false;
    let generation = 0;
    let resumes = 0;
    const controller = {
      snapshot: { visible: true, busy: false },
      write: () => true,
      waitForWriteSettlement: () => Promise.resolve(),
    };
    const pending = writeStoryBeatAndContinueAtStableScene(controller, {
      isPaused: () => paused,
      pause: () => {
        paused = true;
        generation += 1;
      },
      waitForStable: () => stable.promise,
      pauseGeneration: () => generation,
      canResume: () => true,
      resume: () => {
        resumes += 1;
        paused = false;
        generation += 1;
      },
    });
    controller.snapshot = { visible: false, busy: false };
    stable.resolve();

    await expect(pending).resolves.toBe(false);
    expect(paused).toBe(false);
    expect(resumes).toBe(1);
  });

  it("binds the click to one opportunity identity and releases its pause after replacement", async () => {
    const stable = deferred();
    let identity = "campaign:event:10:first";
    let paused = false;
    let generation = 0;
    let writes = 0;
    let resumes = 0;
    const controller = {
      snapshot: { visible: true, busy: false },
      currentWriteIdentity: () => identity,
      write: () => {
        writes += 1;
        return true;
      },
      waitForWriteSettlement: () => Promise.resolve(),
    };
    const pending = writeStoryBeatAndContinueAtStableScene(controller, {
      isPaused: () => paused,
      pause: () => {
        paused = true;
        generation += 1;
      },
      waitForStable: () => stable.promise,
      pauseGeneration: () => generation,
      canResume: () => true,
      resume: () => {
        resumes += 1;
        paused = false;
        generation += 1;
      },
    });
    identity = "campaign:event:11:replacement";
    stable.resolve();

    await expect(pending).resolves.toBe(false);
    expect(writes).toBe(0);
    expect(paused).toBe(false);
    expect(resumes).toBe(1);
  });
});
