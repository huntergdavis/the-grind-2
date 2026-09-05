export interface StoryBeatWriteSnapshot {
  readonly visible: boolean;
  readonly busy: boolean;
}

export interface StoryBeatWritePort {
  readonly snapshot: StoryBeatWriteSnapshot;
  write(): boolean;
}

export interface StoryBeatSceneLeasePort {
  isPaused(): boolean;
  pause(): void;
  waitForStable(): Promise<void>;
}

export async function writeStoryBeatAtStableScene(
  controller: StoryBeatWritePort,
  scene: StoryBeatSceneLeasePort,
): Promise<boolean> {
  const initial = controller.snapshot;
  if (!initial.visible || initial.busy) return false;
  if (!scene.isPaused()) scene.pause();
  await scene.waitForStable();
  if (!scene.isPaused()) return false;
  const stable = controller.snapshot;
  return stable.visible && !stable.busy && controller.write();
}
