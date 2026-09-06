export interface StoryBeatWriteSnapshot {
  readonly visible: boolean;
  readonly busy: boolean;
}

export interface StoryBeatWritePort {
  readonly snapshot: StoryBeatWriteSnapshot;
  currentWriteIdentity?(): string | null;
  write(): boolean;
}

export interface StoryBeatSceneLeasePort {
  isPaused(): boolean;
  pause(): void;
  waitForStable(): Promise<void>;
}

export interface StoryBeatSettlingWritePort extends StoryBeatWritePort {
  waitForWriteSettlement(): Promise<void>;
}

export interface StoryBeatContinuingSceneLeasePort extends StoryBeatSceneLeasePort {
  pauseGeneration(): number;
  canResume(): boolean;
  resume(): void;
}

export async function writeStoryBeatAtStableScene(
  controller: StoryBeatWritePort,
  scene: StoryBeatSceneLeasePort,
): Promise<boolean> {
  const initial = controller.snapshot;
  if (!initial.visible || initial.busy) return false;
  const initialIdentity = controller.currentWriteIdentity?.() ?? null;
  if (!scene.isPaused()) scene.pause();
  await scene.waitForStable();
  if (!scene.isPaused()) return false;
  const stable = controller.snapshot;
  return stable.visible
    && !stable.busy
    && (
      initialIdentity === null
      || controller.currentWriteIdentity?.() === initialIdentity
    )
    && controller.write();
}

export async function writeStoryBeatAndContinueAtStableScene(
  controller: StoryBeatSettlingWritePort,
  scene: StoryBeatContinuingSceneLeasePort,
): Promise<boolean> {
  const initiallyPaused = scene.isPaused();
  let ownedPauseGeneration: number | null = null;
  const resumeOwnedPause = (): void => {
    if (
      initiallyPaused
      || ownedPauseGeneration === null
      || !scene.isPaused()
      || scene.pauseGeneration() !== ownedPauseGeneration
      || !scene.canResume()
    ) return;
    scene.resume();
  };
  const started = await writeStoryBeatAtStableScene(controller, {
    isPaused: () => scene.isPaused(),
    pause: () => {
      scene.pause();
      ownedPauseGeneration = scene.pauseGeneration();
    },
    waitForStable: () => scene.waitForStable(),
  });
  if (!started) {
    resumeOwnedPause();
    return false;
  }
  if (initiallyPaused || ownedPauseGeneration === null) return true;
  await controller.waitForWriteSettlement();
  resumeOwnedPause();
  return true;
}
