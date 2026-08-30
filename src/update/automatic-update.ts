export const updateIntervalMs = 60 * 60 * 1_000;
export const updateJitterMs = 15 * 60 * 1_000;

export interface VersionManifest {
  version: string;
}

export interface AutomaticUpdateDependencies {
  currentVersion: string;
  fetchVersion: () => Promise<unknown>;
  randomUnit: () => number;
  schedule: (callback: () => void, delayMs: number) => number;
  cancel: (timer: number) => void;
  isVisible: () => boolean;
  applyUpdate: (nextVersion: string) => Promise<void>;
  report: (status: "current" | "available" | "deferred" | "error", version?: string) => void;
}

export function parseVersionManifest(value: unknown): VersionManifest | null {
  if (typeof value !== "object" || value === null || !("version" in value)) return null;
  const version = (value as { version?: unknown }).version;
  return typeof version === "string" && versionParts(version) !== null ? { version } : null;
}

function versionParts(version: string): readonly [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const left = versionParts(candidate);
  const right = versionParts(current);
  if (left === null || right === null) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart !== rightPart) return leftPart > rightPart;
  }
  return false;
}

export function nextUpdateDelay(randomUnit: number): number {
  const bounded = Number.isFinite(randomUnit) ? Math.max(0, Math.min(0.999_999_999, randomUnit)) : 0;
  return updateIntervalMs + Math.floor(bounded * updateJitterMs);
}

export class AutomaticUpdateMonitor {
  private timer: number | null = null;
  private checking = false;
  private applying = false;
  private pendingVersion: string | null = null;
  private stopped = false;

  constructor(private readonly dependencies: AutomaticUpdateDependencies) {}

  start(): void {
    if (this.stopped) return;
    void this.check();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.dependencies.cancel(this.timer);
    this.timer = null;
  }

  notifyVisible(): void {
    if (!this.dependencies.isVisible() || this.pendingVersion === null || this.applying) return;
    void this.apply(this.pendingVersion);
  }

  async check(): Promise<void> {
    if (this.stopped || this.checking || this.applying) return;
    this.checking = true;
    try {
      const manifest = parseVersionManifest(await this.dependencies.fetchVersion());
      if (manifest === null) throw new Error("Invalid version manifest");
      if (!isNewerVersion(manifest.version, this.dependencies.currentVersion)) {
        this.dependencies.report("current", manifest.version);
        this.scheduleNext();
        return;
      }
      this.pendingVersion = manifest.version;
      this.dependencies.report(this.dependencies.isVisible() ? "available" : "deferred", manifest.version);
      if (this.dependencies.isVisible()) await this.apply(manifest.version);
    } catch {
      this.dependencies.report("error");
      this.scheduleNext();
    } finally {
      this.checking = false;
    }
  }

  private async apply(version: string): Promise<void> {
    if (this.applying || this.stopped) return;
    this.applying = true;
    try {
      await this.dependencies.applyUpdate(version);
      this.pendingVersion = null;
    } catch {
      this.dependencies.report("error", version);
      this.applying = false;
      this.scheduleNext();
    }
  }

  private scheduleNext(): void {
    if (this.stopped || this.applying) return;
    if (this.timer !== null) this.dependencies.cancel(this.timer);
    this.timer = this.dependencies.schedule(() => {
      this.timer = null;
      void this.check();
    }, nextUpdateDelay(this.dependencies.randomUnit()));
  }
}
