import { describe, expect, it } from "vitest";
import type { NarratorExperimentalModelPolicyV1 } from "../narrator/experimental-policy";
import {
  localNarratorDisclosedDownloadBytes,
  localNarratorModelRevision,
  type LocalNarratorAssetInspection,
  type LocalNarratorAssetProgress,
} from "../narrator/local-model-assets";
import type { NarratorOffer } from "../narrator/narrator-client";
import type {
  NarratorCapability,
  NarratorJobV1,
  NarratorLifecycleState,
} from "../narrator/protocol";
import {
  createLocalNarratorUiController,
  localNarratorConsentRecord,
  localNarratorConsentRecordJson,
  localNarratorConsentStorageKey,
  parseLocalNarratorConsentRecord,
  type LocalNarratorAssetStorePort,
  type LocalNarratorClientPort,
  type LocalNarratorConsentStorage,
  type LocalNarratorControllerSnapshot,
} from "./local-narrator-controller";

const standardCapability: NarratorCapability = Object.freeze({
  execution: "wasm",
  budget: "standard",
  storedWeightBudgetBytes: 100 * 1024 * 1024,
  incrementalMemoryBudgetBytes: 256 * 1024 * 1024,
  reason: "local-wasm-worker",
});

const lowEndCapability: NarratorCapability = Object.freeze({
  ...standardCapability,
  budget: "low-end",
  reason: "save-data",
});

function completeInspection(): Extract<
  LocalNarratorAssetInspection,
  { readonly status: "complete" }
> {
  return Object.freeze({
    status: "complete",
    revision: localNarratorModelRevision,
    cachedBytes: localNarratorDisclosedDownloadBytes,
    totalBytes: localNarratorDisclosedDownloadBytes,
    missingArtifacts: Object.freeze([]),
    corruptArtifacts: Object.freeze([]),
  });
}

function missingInspection(): Extract<
  LocalNarratorAssetInspection,
  { readonly status: "missing" }
> {
  return Object.freeze({
    status: "missing",
    revision: localNarratorModelRevision,
    cachedBytes: 0,
    totalBytes: localNarratorDisclosedDownloadBytes,
    missingArtifacts: Object.freeze([{ kind: "model" as const, path: "config.json" }]),
    corruptArtifacts: Object.freeze([]),
  });
}

function corruptInspection(): Extract<
  LocalNarratorAssetInspection,
  { readonly status: "corrupt" }
> {
  return Object.freeze({
    status: "corrupt",
    revision: localNarratorModelRevision,
    cachedBytes: 0,
    totalBytes: localNarratorDisclosedDownloadBytes,
    missingArtifacts: Object.freeze([]),
    corruptArtifacts: Object.freeze([{ kind: "model" as const, path: "config.json" }]),
  });
}

function progressFixture(totalBytes = 1_000): LocalNarratorAssetProgress {
  return Object.freeze({
    artifact: Object.freeze({ kind: "model", path: "config.json" }),
    artifactIndex: 0,
    artifactCount: 8,
    source: "network",
    artifactBytes: totalBytes,
    artifactTotalBytes: 1_401,
    totalBytes,
    totalDownloadBytes: localNarratorDisclosedDownloadBytes,
  });
}

function job(
  campaignId = "campaign:controller",
  sourceFingerprint = "0123456789abcdef",
  fallback = "Rain silvered the old road.",
): NarratorJobV1 {
  return Object.freeze({
    schemaVersion: 1,
    campaignId,
    eventId: `${campaignId}:event:1`,
    tick: 1,
    sourceFingerprint,
    prompt: Object.freeze({
      schemaVersion: 1,
      task: "single-ambient-line",
      voice: "spare-observer-v1",
      move: "establish-setting",
      facts: Object.freeze({
        schemaVersion: 1,
        kind: "public-scene",
        sceneKind: "travel",
        place: "The Old Road",
        energy: "steady",
      }),
    }),
    deterministicFallback: fallback,
    maximumInputTokens: 320,
    maximumOutputTokens: 48,
  });
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class MemoryStorage implements LocalNarratorConsentStorage {
  readonly values = new Map<string, string>();
  readonly events: string[];
  getCalls = 0;
  setCalls = 0;
  removeCalls = 0;
  throwOnGet = false;
  throwOnSet = false;

  constructor(events: string[] = []) {
    this.events = events;
  }

  getItem(key: string): string | null {
    this.getCalls += 1;
    if (this.throwOnGet) throw new Error("storage read failed");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1;
    if (this.throwOnSet) throw new Error("storage write failed");
    this.events.push("consent:set");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removeCalls += 1;
    this.events.push("consent:remove");
    this.values.delete(key);
  }
}

class FakeAssetStore implements LocalNarratorAssetStorePort {
  inspectCalls = 0;
  downloadCalls = 0;
  removeCalls = 0;
  inspection: LocalNarratorAssetInspection = completeInspection();
  readonly events: string[];
  downloadImplementation: (
    signal: AbortSignal,
    onProgress?: (progress: LocalNarratorAssetProgress) => void,
  ) => Promise<Extract<LocalNarratorAssetInspection, { readonly status: "complete" }>>;

  constructor(events: string[] = []) {
    this.events = events;
    this.downloadImplementation = async (_signal, onProgress) => {
      this.events.push("download:start");
      onProgress?.(progressFixture());
      this.events.push("download:complete");
      return completeInspection();
    };
  }

  async inspect(): Promise<LocalNarratorAssetInspection> {
    this.inspectCalls += 1;
    return this.inspection;
  }

  async download(
    signal: AbortSignal,
    onProgress?: (progress: LocalNarratorAssetProgress) => void,
  ): Promise<Extract<LocalNarratorAssetInspection, { readonly status: "complete" }>> {
    this.downloadCalls += 1;
    return this.downloadImplementation(signal, onProgress);
  }

  async remove(): Promise<boolean> {
    this.removeCalls += 1;
    this.events.push("cache:remove");
    return true;
  }
}

class FakeClient implements LocalNarratorClientPort {
  readonly events: string[];
  readonly enableCampaigns: string[] = [];
  readonly suppressions: Array<"hidden" | "eco" | null> = [];
  readonly currentSources: Array<NarratorJobV1 | null> = [];
  readonly narrated: NarratorJobV1[] = [];
  state: NarratorLifecycleState = "off";
  disableCalls = 0;
  enableResult = true;
  offer: (value: NarratorJobV1) => NarratorOffer = (value) => ({
    initial: { source: "deterministic", text: value.deterministicFallback },
    enhancement: null,
  });

  constructor(events: string[] = []) {
    this.events = events;
  }

  enableExperimental(
    campaignId: string,
    _policy: NarratorExperimentalModelPolicyV1,
    _capability: NarratorCapability,
  ): boolean {
    this.events.push("client:enable");
    this.enableCampaigns.push(campaignId);
    this.state = this.enableResult ? "available" : "failed";
    return this.enableResult;
  }

  disable(): void {
    this.disableCalls += 1;
    this.events.push("client:disable");
    this.state = "off";
  }

  setSuppressed(reason: "hidden" | "eco" | null): void {
    this.suppressions.push(reason);
  }

  setCurrentSource(value: NarratorJobV1 | null): void {
    this.currentSources.push(value);
  }

  narrate(value: NarratorJobV1): NarratorOffer {
    this.narrated.push(value);
    return this.offer(value);
  }
}

function fixture(options: {
  readonly consent?: boolean;
  readonly capability?: NarratorCapability;
  readonly onChange?: (snapshot: LocalNarratorControllerSnapshot) => void;
} = {}) {
  const events: string[] = [];
  const storage = new MemoryStorage(events);
  if (options.consent === true) {
    storage.values.set(localNarratorConsentStorageKey, localNarratorConsentRecordJson);
  }
  const assetStore = new FakeAssetStore(events);
  const client = new FakeClient(events);
  let capabilityCalls = 0;
  const controller = createLocalNarratorUiController({
    storage,
    assetStore,
    client,
    getCapability: () => {
      capabilityCalls += 1;
      return options.capability ?? standardCapability;
    },
    ...(options.onChange === undefined ? {} : { onChange: options.onChange }),
  });
  return {
    assetStore,
    client,
    controller,
    events,
    get capabilityCalls(): number {
      return capabilityCalls;
    },
    storage,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("local narrator consent", () => {
  it("accepts only the exact browser-global current-model record", () => {
    expect(parseLocalNarratorConsentRecord(localNarratorConsentRecordJson))
      .toBe(localNarratorConsentRecord);
    const candidates: unknown[] = [
      null,
      "",
      "{",
      "[]",
      JSON.stringify({ ...localNarratorConsentRecord, extra: true }),
      JSON.stringify({ ...localNarratorConsentRecord, enabled: false }),
      JSON.stringify({ ...localNarratorConsentRecord, schemaVersion: 2 }),
      JSON.stringify({ ...localNarratorConsentRecord, modelId: "replacement" }),
      JSON.stringify({ ...localNarratorConsentRecord, revision: "0".repeat(40) }),
      JSON.stringify({ ...localNarratorConsentRecord, artifactManifestHash: "0".repeat(16) }),
    ];
    for (const candidate of candidates) {
      expect(parseLocalNarratorConsentRecord(candidate as string | null)).toBeNull();
    }
    expect(Object.keys(localNarratorConsentRecord).sort()).toEqual([
      "artifactManifestHash",
      "enabled",
      "modelId",
      "revision",
      "schemaVersion",
    ]);
    expect(Object.isFrozen(localNarratorConsentRecord)).toBe(true);
  });
});

describe("local narrator setup lifecycle", () => {
  it("does no storage, cache, capability, download, or client work by default", () => {
    const state = fixture();

    expect(state.controller.snapshot).toMatchObject({
      status: "off",
      enabled: false,
      downloading: false,
      line: null,
      progress: null,
    });
    expect(state.storage.getCalls).toBe(0);
    expect(state.assetStore.inspectCalls).toBe(0);
    expect(state.assetStore.downloadCalls).toBe(0);
    expect(state.capabilityCalls).toBe(0);
    expect(state.client.disableCalls).toBe(0);
    expect(state.client.enableCampaigns).toEqual([]);
  });

  it("does not inspect or download without a valid persisted consent record", async () => {
    const state = fixture();
    await state.controller.restore("campaign:controller");

    expect(state.controller.snapshot.status).toBe("off");
    expect(state.storage.getCalls).toBe(1);
    expect(state.assetStore.inspectCalls).toBe(0);
    expect(state.assetStore.downloadCalls).toBe(0);
    expect(state.capabilityCalls).toBe(0);

    state.storage.values.set(
      localNarratorConsentStorageKey,
      JSON.stringify({ ...localNarratorConsentRecord, revision: "0".repeat(40) }),
    );
    await state.controller.restore("campaign:controller");
    expect(state.assetStore.inspectCalls).toBe(0);
    expect(state.controller.snapshot.status).toBe("off");
  });

  it("restores only a complete exact cache and classifies capability before enabling", async () => {
    const state = fixture({ consent: true });
    await state.controller.restore("campaign:controller");

    expect(state.assetStore.inspectCalls).toBe(1);
    expect(state.assetStore.downloadCalls).toBe(0);
    expect(state.capabilityCalls).toBe(1);
    expect(state.client.enableCampaigns).toEqual(["campaign:controller"]);
    expect(state.controller.snapshot).toMatchObject({
      status: "ready",
      consented: true,
      enabled: true,
      downloading: false,
      error: null,
    });
  });

  it("never auto-downloads missing or corrupt cache content", async () => {
    for (const inspection of [missingInspection(), corruptInspection()]) {
      const state = fixture({ consent: true });
      state.assetStore.inspection = inspection;
      await state.controller.restore("campaign:controller");

      expect(state.controller.snapshot.status).toBe("needs-setup");
      expect(state.controller.snapshot.consented).toBe(true);
      expect(state.assetStore.downloadCalls).toBe(0);
      expect(state.capabilityCalls).toBe(0);
      expect(state.client.enableCampaigns).toEqual([]);
    }
  });

  it("preserves a storage read failure instead of silently treating it as off", async () => {
    const state = fixture();
    state.storage.throwOnGet = true;
    await state.controller.restore("campaign:controller");

    expect(state.controller.snapshot).toMatchObject({
      status: "failed",
      enabled: false,
      error: { code: "consent-read-failed" },
    });
    expect(state.assetStore.inspectCalls).toBe(0);
  });

  it("downloads explicitly, reports immutable progress, then persists before enabling", async () => {
    const observed: LocalNarratorAssetProgress[] = [];
    const state = fixture();
    await state.controller.install("campaign:controller", undefined, (progress) => {
      observed.push(progress);
    });

    expect(state.events.indexOf("download:complete")).toBeLessThan(
      state.events.indexOf("consent:set"),
    );
    expect(state.events.indexOf("consent:set")).toBeLessThan(
      state.events.indexOf("client:enable"),
    );
    expect(state.storage.values.get(localNarratorConsentStorageKey))
      .toBe(localNarratorConsentRecordJson);
    expect(observed).toHaveLength(1);
    expect(Object.isFrozen(observed[0])).toBe(true);
    expect(Object.isFrozen(observed[0]?.artifact)).toBe(true);
    expect(state.controller.snapshot).toMatchObject({
      status: "ready",
      consented: true,
      enabled: true,
      downloading: false,
      progress: null,
    });
  });

  it("does not download on an ineligible device or consent to an invalid completion", async () => {
    const unsupported = fixture({ capability: lowEndCapability });
    await unsupported.controller.install("campaign:controller");
    expect(unsupported.controller.snapshot.status).toBe("unsupported");
    expect(unsupported.assetStore.downloadCalls).toBe(0);
    expect(unsupported.storage.setCalls).toBe(0);

    const invalid = fixture();
    invalid.assetStore.downloadImplementation = async () => ({
      ...completeInspection(),
      cachedBytes: localNarratorDisclosedDownloadBytes - 1,
    });
    await invalid.controller.install("campaign:controller");
    expect(invalid.controller.snapshot.status).toBe("failed");
    expect(invalid.storage.setCalls).toBe(0);
    expect(invalid.client.enableCampaigns).toEqual([]);
  });

  it("aborts through controller and caller cancellation without saving consent", async () => {
    for (const cancelWithCaller of [false, true]) {
      const state = fixture();
      let observedAbort = false;
      state.assetStore.downloadImplementation = (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          observedAbort = true;
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
      });
      const caller = new AbortController();
      const installing = state.controller.install("campaign:controller", caller.signal);
      expect(state.controller.snapshot.downloading).toBe(true);
      if (cancelWithCaller) caller.abort();
      else expect(state.controller.cancelInstall()).toBe(true);
      await installing;

      expect(observedAbort).toBe(true);
      expect(state.controller.snapshot).toMatchObject({
        status: "needs-setup",
        downloading: false,
        error: { code: "cancelled" },
      });
      expect(state.storage.setCalls).toBe(0);
      expect(state.client.enableCampaigns).toEqual([]);
    }
  });

  it("disables without removing cache and removes only after disabling", async () => {
    const state = fixture({ consent: true });
    await state.controller.restore("campaign:controller");
    state.controller.disable();

    expect(state.storage.values.has(localNarratorConsentStorageKey)).toBe(false);
    expect(state.assetStore.removeCalls).toBe(0);
    expect(state.controller.snapshot).toMatchObject({
      status: "off",
      consented: false,
      enabled: false,
      line: null,
    });

    state.storage.values.set(localNarratorConsentStorageKey, localNarratorConsentRecordJson);
    await state.controller.restore("campaign:controller");
    state.events.length = 0;
    await state.controller.remove();
    expect(state.events.indexOf("client:disable")).toBeLessThan(
      state.events.indexOf("cache:remove"),
    );
    expect(state.events.indexOf("consent:remove")).toBeLessThan(
      state.events.indexOf("cache:remove"),
    );
    expect(state.assetStore.removeCalls).toBe(1);
  });
});

describe("local narrator presentation lifecycle", () => {
  it("presents deterministic text first, deduplicates, then accepts the matching enhancement", async () => {
    const enhancement = deferred<{ source: "model"; text: string } | null>();
    const snapshots: LocalNarratorControllerSnapshot[] = [];
    const state = fixture({
      consent: true,
      onChange: (snapshot) => snapshots.push(snapshot),
    });
    state.client.offer = (value) => ({
      initial: { source: "deterministic", text: value.deterministicFallback },
      enhancement: enhancement.promise,
    });
    await state.controller.restore("campaign:controller");
    const scene = job();

    state.controller.present(scene, true);
    expect(state.controller.snapshot.line).toEqual({
      source: "deterministic",
      text: scene.deterministicFallback,
      sourceFingerprint: scene.sourceFingerprint,
    });
    state.controller.present(scene, true);
    expect(state.client.narrated).toHaveLength(1);

    enhancement.resolve({ source: "model", text: "The rain remembers every passing boot." });
    await settle();
    expect(state.controller.snapshot.line).toEqual({
      source: "model",
      text: "The rain remembers every passing boot.",
      sourceFingerprint: scene.sourceFingerprint,
    });
    expect(snapshots.some((snapshot) => snapshot.line?.source === "deterministic")).toBe(true);
    expect(Object.isFrozen(state.controller.snapshot)).toBe(true);
    expect(Object.isFrozen(state.controller.snapshot.line)).toBe(true);
  });

  it("rejects stale enhancements after a scene or campaign changes", async () => {
    const firstEnhancement = deferred<{ source: "model"; text: string } | null>();
    const state = fixture({ consent: true });
    state.client.offer = (value) => ({
      initial: { source: "deterministic", text: value.deterministicFallback },
      enhancement: value.sourceFingerprint === "0123456789abcdef"
        ? firstEnhancement.promise
        : null,
    });
    await state.controller.restore("campaign:controller");
    state.controller.present(job(), true);
    const second = job(
      "campaign:controller",
      "fedcba9876543210",
      "A lantern leaned into the wind.",
    );
    state.controller.present(second, true);
    firstEnhancement.resolve({ source: "model", text: "This result is stale." });
    await settle();
    expect(state.controller.snapshot.line?.text).toBe(second.deterministicFallback);

    state.controller.setCampaign("campaign:replacement");
    expect(state.client.enableCampaigns.at(-1)).toBe("campaign:replacement");
    expect(state.assetStore.inspectCalls).toBe(1);
    expect(state.controller.snapshot.line).toBeNull();
  });

  it("surfaces a terminal worker failure and keeps cached recovery explicit", async () => {
    const enhancement = deferred<{ source: "model"; text: string } | null>();
    const state = fixture({ consent: true });
    state.client.offer = (value) => ({
      initial: { source: "deterministic", text: value.deterministicFallback },
      enhancement: enhancement.promise,
    });
    await state.controller.restore("campaign:controller");
    state.controller.present(job(), true);
    state.client.state = "failed";
    enhancement.resolve(null);
    await settle();

    expect(state.controller.snapshot).toMatchObject({
      status: "failed",
      phase: "failed",
      consented: true,
      enabled: false,
      line: null,
      error: {
        code: "worker-failed",
        message: "The on-device narrator stopped. Verify the cached model to re-enable it.",
      },
    });
    expect(state.client.currentSources.at(-1)).toBeNull();
    expect(state.assetStore.removeCalls).toBe(0);
  });

  it("preserves a settled deterministic line after host ineligibility without re-offering", async () => {
    const state = fixture({ consent: true });
    await state.controller.restore("campaign:controller");
    const scene = job();
    state.controller.present(scene, true);
    state.client.suppressions.length = 0;

    state.controller.present(scene, false);
    expect(state.controller.snapshot).toMatchObject({
      status: "suppressed",
      suppression: "cutaway",
      line: null,
    });
    expect(state.client.currentSources.at(-1)).toBeNull();
    expect(state.client.suppressions).toEqual([null]);

    state.controller.present(scene, true);
    expect(state.controller.snapshot.line?.text).toBe(scene.deterministicFallback);
    expect(state.client.narrated).toHaveLength(1);
  });

  it("re-offers only an interrupted pending enhancement after host ineligibility", async () => {
    const firstEnhancement = deferred<{ source: "model"; text: string } | null>();
    const state = fixture({ consent: true });
    state.client.offer = (value) => ({
      initial: { source: "deterministic", text: value.deterministicFallback },
      enhancement: state.client.narrated.length === 1 ? firstEnhancement.promise : null,
    });
    await state.controller.restore("campaign:controller");
    const scene = job();

    state.controller.present(scene, true);
    state.controller.present(scene, false);
    state.controller.present(scene, true);
    expect(state.client.narrated).toHaveLength(2);
    expect(state.controller.snapshot.line?.source).toBe("deterministic");

    state.controller.present(scene, false);
    state.controller.present(scene, true);
    expect(state.client.narrated).toHaveLength(2);

    firstEnhancement.resolve({ source: "model", text: "This interrupted result is stale." });
    await settle();
    expect(state.controller.snapshot.line).toEqual({
      source: "deterministic",
      text: scene.deterministicFallback,
      sourceFingerprint: scene.sourceFingerprint,
    });
  });

  it("arms retry before a deterministic-line subscriber synchronously suppresses presentation", async () => {
    const firstEnhancement = deferred<{ source: "model"; text: string } | null>();
    let onDeterministicLine: (() => void) | null = null;
    const state = fixture({
      consent: true,
      onChange: (snapshot) => {
        if (snapshot.line?.source === "deterministic") onDeterministicLine?.();
      },
    });
    state.client.offer = (value) => ({
      initial: { source: "deterministic", text: value.deterministicFallback },
      enhancement: state.client.narrated.length === 1 ? firstEnhancement.promise : null,
    });
    await state.controller.restore("campaign:controller");
    const scene = job();
    let reentered = false;
    onDeterministicLine = () => {
      if (reentered) return;
      reentered = true;
      state.controller.present(scene, false);
      state.controller.present(scene, true);
    };

    state.controller.present(scene, true);
    expect(reentered).toBe(true);
    expect(state.client.narrated).toHaveLength(2);
    expect(state.controller.snapshot.line?.source).toBe("deterministic");

    firstEnhancement.resolve({ source: "model", text: "This reentrant result is stale." });
    await settle();
    expect(state.controller.snapshot.line?.text).toBe(scene.deterministicFallback);
  });

  it("settles pending identity before a queued suppression microtask", async () => {
    for (const outcome of ["null", "reject"] as const) {
      const enhancement = deferred<{ source: "model"; text: string } | null>();
      const state = fixture({ consent: true });
      state.client.offer = (value) => ({
        initial: { source: "deterministic", text: value.deterministicFallback },
        enhancement: enhancement.promise,
      });
      await state.controller.restore("campaign:controller");
      const scene = job();
      state.controller.present(scene, true);

      if (outcome === "null") enhancement.resolve(null);
      else enhancement.reject(new Error("non-terminal enhancement failure"));
      await new Promise<void>((resolve) => {
        queueMicrotask(() => {
          state.controller.present(scene, false);
          state.controller.present(scene, true);
          resolve();
        });
      });
      await settle();

      expect(state.client.narrated, outcome).toHaveLength(1);
      expect(state.controller.snapshot.line?.text, outcome).toBe(scene.deterministicFallback);
    }
  });

  it("restores an accepted model line across repeated host ineligibility without downgrading", async () => {
    const enhancement = deferred<{ source: "model"; text: string } | null>();
    const state = fixture({ consent: true });
    state.client.offer = (value) => ({
      initial: { source: "deterministic", text: value.deterministicFallback },
      enhancement: enhancement.promise,
    });
    await state.controller.restore("campaign:controller");
    const scene = job();
    state.controller.present(scene, true);
    enhancement.resolve({ source: "model", text: "The rain remembers every passing boot." });
    await settle();

    for (let index = 0; index < 3; index += 1) {
      state.controller.present(scene, false);
      expect(state.controller.snapshot.line).toBeNull();
      state.controller.present(scene, true);
      expect(state.controller.snapshot.line).toEqual({
        source: "model",
        text: "The rain remembers every passing boot.",
        sourceFingerprint: scene.sourceFingerprint,
      });
    }
    expect(state.client.narrated).toHaveLength(1);
  });

  it("uses lifecycle suppression only for actual visibility and eco signals", async () => {
    const state = fixture({ consent: true });
    await state.controller.restore("campaign:controller");
    state.client.suppressions.length = 0;

    state.controller.setHidden(true);
    state.controller.setHidden(false);
    state.controller.setPresentationContext({
      documentHidden: false,
      ecoMode: true,
      cutawayActive: false,
      view: "watch",
      battleActive: false,
    });
    state.controller.setPresentationContext({
      documentHidden: false,
      ecoMode: false,
      cutawayActive: false,
      view: "map",
      battleActive: false,
    });
    state.controller.setPresentationContext({
      documentHidden: false,
      ecoMode: false,
      cutawayActive: false,
      view: "watch",
      battleActive: true,
    });

    expect(state.client.suppressions).toEqual(["hidden", null, "eco", null, null]);
    expect(state.controller.snapshot).toMatchObject({
      status: "suppressed",
      suppression: "battle",
    });
  });

  it("invalidates a hidden enhancement and re-offers after visibility returns", async () => {
    const enhancement = deferred<{ source: "model"; text: string } | null>();
    const state = fixture({ consent: true });
    state.client.offer = (value) => ({
      initial: { source: "deterministic", text: value.deterministicFallback },
      enhancement: enhancement.promise,
    });
    await state.controller.restore("campaign:controller");
    const scene = job();
    state.controller.present(scene, true);
    state.controller.setHidden(true);
    enhancement.resolve({ source: "model", text: "A stale hidden result." });
    await settle();
    expect(state.controller.snapshot.line).toBeNull();

    state.controller.setHidden(false);
    state.controller.present(scene, true);
    expect(state.controller.snapshot.line?.text).toBe(scene.deterministicFallback);
    expect(state.client.narrated).toHaveLength(2);
  });

  it("disposes session resources while retaining browser-global consent", async () => {
    const state = fixture({ consent: true });
    await state.controller.restore("campaign:controller");
    state.controller.present(job(), true);
    state.controller.dispose();

    expect(state.storage.values.get(localNarratorConsentStorageKey))
      .toBe(localNarratorConsentRecordJson);
    expect(state.controller.snapshot).toMatchObject({
      status: "off",
      consented: true,
      enabled: false,
      line: null,
    });
    expect(state.assetStore.removeCalls).toBe(0);
  });
});
