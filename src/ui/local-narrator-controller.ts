import {
  isNarratorExperimentalModelEligible,
  type NarratorExperimentalModelPolicyV1,
} from "../narrator/experimental-policy";
import { localNarratorExperimentalPolicy } from "../narrator/local-narrator-host";
import type {
  LocalNarratorAssetInspection,
  LocalNarratorAssetProgress,
  LocalNarratorAssetStore,
} from "../narrator/local-model-assets";
import type {
  NarratorClient,
  NarratorOffer,
} from "../narrator/narrator-client";
import {
  isNarratorBoundedText,
  isNarratorJobV1,
  narratorMaximumOutputCharacters,
  type NarratorCapability,
  type NarratorJobV1,
  type NarratorLifecycleState,
} from "../narrator/protocol";
import type { InspectionView } from "./view-projection";

export const localNarratorConsentStorageKey = "the-grind-2:local-narrator-consent:v1";

export interface LocalNarratorConsentRecordV1 {
  readonly schemaVersion: 1;
  readonly enabled: true;
  readonly modelId: string;
  readonly revision: string;
  readonly artifactManifestHash: string;
}

export const localNarratorConsentRecord = Object.freeze({
  schemaVersion: 1,
  enabled: true,
  modelId: localNarratorExperimentalPolicy.modelId,
  revision: localNarratorExperimentalPolicy.revision,
  artifactManifestHash: localNarratorExperimentalPolicy.artifactManifestHash,
} as const satisfies LocalNarratorConsentRecordV1);

export const localNarratorConsentRecordJson = JSON.stringify(localNarratorConsentRecord);

const consentKeys = Object.freeze([
  "schemaVersion",
  "enabled",
  "modelId",
  "revision",
  "artifactManifestHash",
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function parseLocalNarratorConsentRecord(
  raw: string | null,
): LocalNarratorConsentRecordV1 | null {
  if (raw === null || raw.length === 0 || raw.length > 1_024) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)
    || !hasExactKeys(value, consentKeys)
    || value.schemaVersion !== localNarratorConsentRecord.schemaVersion
    || value.enabled !== true
    || value.modelId !== localNarratorConsentRecord.modelId
    || value.revision !== localNarratorConsentRecord.revision
    || value.artifactManifestHash !== localNarratorConsentRecord.artifactManifestHash) return null;
  return localNarratorConsentRecord;
}

export type LocalNarratorControllerPhase =
  | "off"
  | "checking"
  | "needs-setup"
  | "downloading"
  | "ready"
  | "suppressed"
  | "unsupported"
  | "failed";

export type LocalNarratorSuppressionReason =
  | "hidden"
  | "eco"
  | "cutaway"
  | "view"
  | "battle";

export interface LocalNarratorPresentationContext {
  readonly documentHidden: boolean;
  readonly ecoMode: boolean;
  readonly cutawayActive: boolean;
  readonly view: InspectionView;
  readonly battleActive: boolean;
}

export interface LocalNarratorVisibleLine {
  readonly source: "deterministic" | "model";
  readonly text: string;
  readonly sourceFingerprint: string;
}

export interface LocalNarratorControllerError {
  readonly code: string;
  readonly message: string;
}

export interface LocalNarratorControllerSnapshot {
  readonly status: LocalNarratorControllerPhase;
  readonly detail: string;
  readonly phase: LocalNarratorControllerPhase;
  readonly consented: boolean;
  readonly enabled: boolean;
  readonly downloading: boolean;
  readonly campaignId: string | null;
  readonly suppression: LocalNarratorSuppressionReason | null;
  readonly line: LocalNarratorVisibleLine | null;
  readonly progress: LocalNarratorAssetProgress | null;
  readonly error: LocalNarratorControllerError | null;
}

export interface LocalNarratorConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LocalNarratorAssetStorePort = Pick<
  LocalNarratorAssetStore,
  "inspect" | "download" | "remove"
>;

export interface LocalNarratorClientPort {
  readonly state: NarratorLifecycleState;
  enableExperimental(
    campaignId: string,
    policy: NarratorExperimentalModelPolicyV1,
    capability: NarratorCapability,
  ): boolean;
  disable(): void;
  setSuppressed(reason: "hidden" | "eco" | null): void;
  setCurrentSource(job: NarratorJobV1 | null): void;
  narrate(job: NarratorJobV1): NarratorOffer;
}

type NarratorClientCompatible = Pick<
  NarratorClient,
  "state" | "enableExperimental" | "disable" | "setSuppressed" | "setCurrentSource" | "narrate"
>;

export interface LocalNarratorControllerDependencies {
  readonly storage: LocalNarratorConsentStorage;
  readonly assetStore: LocalNarratorAssetStorePort;
  readonly client: LocalNarratorClientPort | NarratorClientCompatible;
  readonly getCapability: () => NarratorCapability;
  readonly onChange?: (snapshot: LocalNarratorControllerSnapshot) => void;
}

const defaultPresentationContext = Object.freeze({
  documentHidden: false,
  ecoMode: false,
  cutawayActive: false,
  view: "watch",
  battleActive: false,
} as const satisfies LocalNarratorPresentationContext);

function suppressionFor(
  context: LocalNarratorPresentationContext,
): LocalNarratorSuppressionReason | null {
  if (context.documentHidden) return "hidden";
  if (context.ecoMode) return "eco";
  if (context.cutawayActive) return "cutaway";
  if (context.view !== "watch") return "view";
  if (context.battleActive) return "battle";
  return null;
}

function clientSuppressionFor(
  reason: LocalNarratorSuppressionReason | null,
): "hidden" | "eco" | null {
  if (reason === "hidden" || reason === "eco") return reason;
  return null;
}

function frozenProgress(progress: LocalNarratorAssetProgress): LocalNarratorAssetProgress {
  return Object.freeze({
    ...progress,
    artifact: Object.freeze({ ...progress.artifact }),
  });
}

function completeAssetsAreExact(
  inspection: LocalNarratorAssetInspection,
): inspection is Extract<LocalNarratorAssetInspection, { readonly status: "complete" }> {
  return inspection.status === "complete"
    && inspection.revision === localNarratorExperimentalPolicy.revision
    && inspection.totalBytes === localNarratorExperimentalPolicy.disclosedDownloadBytes
    && inspection.cachedBytes === inspection.totalBytes
    && inspection.missingArtifacts.length === 0
    && inspection.corruptArtifacts.length === 0;
}

function safeCallback(
  callback: ((snapshot: LocalNarratorControllerSnapshot) => void) | undefined,
  snapshot: LocalNarratorControllerSnapshot,
): void {
  try {
    callback?.(snapshot);
  } catch {
    // Presentation observers cannot break narrator lifecycle invariants.
  }
}

export class LocalNarratorController {
  private phase: LocalNarratorControllerPhase = "off";
  private consented = false;
  private enabled = false;
  private campaignId: string | null = null;
  private context: LocalNarratorPresentationContext = defaultPresentationContext;
  private line: LocalNarratorVisibleLine | null = null;
  private rememberedLine: LocalNarratorVisibleLine | null = null;
  private progress: LocalNarratorAssetProgress | null = null;
  private error: LocalNarratorControllerError | null = null;
  private capability: NarratorCapability | null = null;
  private lastNarratedFingerprint: string | null = null;
  private pendingEnhancementFingerprint: string | null = null;
  private pendingEnhancementEpoch: number | null = null;
  private operationEpoch = 0;
  private presentationEpoch = 0;
  private installAbortController: AbortController | null = null;
  private installTask: Promise<LocalNarratorControllerSnapshot> | null = null;
  private installOperationEpoch: number | null = null;
  private readonly listeners = new Set<(snapshot: LocalNarratorControllerSnapshot) => void>();
  private currentSnapshot: LocalNarratorControllerSnapshot;

  constructor(private readonly dependencies: LocalNarratorControllerDependencies) {
    if (dependencies.onChange !== undefined) this.listeners.add(dependencies.onChange);
    this.currentSnapshot = this.buildSnapshot();
  }

  get snapshot(): LocalNarratorControllerSnapshot {
    return this.currentSnapshot;
  }

  subscribe(listener: (snapshot: LocalNarratorControllerSnapshot) => void): () => void {
    this.listeners.add(listener);
    safeCallback(listener, this.currentSnapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async restore(campaignId: string): Promise<LocalNarratorControllerSnapshot> {
    if (!this.prepareCampaign(campaignId)) return this.currentSnapshot;
    const operationEpoch = ++this.operationEpoch;
    this.abortInstall();
    this.disableClient();
    this.clearVisibleState();
    const consentState = this.consentStateFromStorage();
    if (consentState === "failed") {
      this.publish();
      return this.currentSnapshot;
    }
    if (consentState === "absent") {
      this.phase = "off";
      this.publish();
      return this.currentSnapshot;
    }

    this.phase = "checking";
    this.error = null;
    this.publish();
    let inspection: LocalNarratorAssetInspection;
    try {
      inspection = await this.dependencies.assetStore.inspect();
    } catch {
      if (operationEpoch !== this.operationEpoch) return this.currentSnapshot;
      this.fail("cache-inspection-failed", "The local narrator cache could not be checked.");
      return this.currentSnapshot;
    }
    if (operationEpoch !== this.operationEpoch) return this.currentSnapshot;
    if (!completeAssetsAreExact(inspection)) {
      this.phase = inspection.status === "unsupported" ? "unsupported" : "needs-setup";
      this.error = inspection.status === "corrupt"
        ? Object.freeze({ code: "cache-corrupt", message: "The local narrator model must be downloaded again." })
        : inspection.status === "unsupported"
          ? Object.freeze({ code: inspection.reason, message: "Local narrator storage is unavailable in this browser." })
          : null;
      this.publish();
      return this.currentSnapshot;
    }
    let capability: NarratorCapability;
    try {
      capability = this.dependencies.getCapability();
    } catch {
      this.fail("capability-check-failed", "This browser's local narration capability could not be checked.");
      return this.currentSnapshot;
    }
    this.capability = capability;
    if (!isNarratorExperimentalModelEligible(localNarratorExperimentalPolicy, capability)) {
      this.phase = "unsupported";
      this.error = Object.freeze({
        code: capability.reason,
        message: "This device does not meet the local narrator's current requirements.",
      });
      this.publish();
      return this.currentSnapshot;
    }
    this.enableCurrentCampaign();
    return this.currentSnapshot;
  }

  install(
    campaignId: string,
    signal?: AbortSignal,
    onProgress?: (progress: LocalNarratorAssetProgress) => void,
  ): Promise<LocalNarratorControllerSnapshot> {
    if (!this.prepareCampaign(campaignId)) return Promise.resolve(this.currentSnapshot);
    if (this.installTask !== null) return this.installTask;
    const operationEpoch = ++this.operationEpoch;
    this.disableClient();
    this.clearVisibleState();
    this.error = null;

    let capability: NarratorCapability;
    try {
      capability = this.dependencies.getCapability();
    } catch {
      this.fail("capability-check-failed", "This browser's local narration capability could not be checked.");
      return Promise.resolve(this.currentSnapshot);
    }
    if (!isNarratorExperimentalModelEligible(localNarratorExperimentalPolicy, capability)) {
      this.capability = capability;
      this.phase = "unsupported";
      this.error = Object.freeze({
        code: capability.reason,
        message: "This device does not meet the local narrator's current requirements.",
      });
      this.publish();
      return Promise.resolve(this.currentSnapshot);
    }
    this.capability = capability;

    const abortController = new AbortController();
    this.installAbortController = abortController;
    const abortFromCaller = (): void => abortController.abort();
    if (signal?.aborted === true) abortController.abort();
    else signal?.addEventListener("abort", abortFromCaller, { once: true });
    this.phase = "downloading";
    this.progress = null;
    this.publish();

    const task = this.runInstall(
      operationEpoch,
      abortController,
      signal,
      abortFromCaller,
      onProgress,
    );
    this.installOperationEpoch = operationEpoch;
    this.installTask = task;
    return task;
  }

  cancelInstall(): boolean {
    if (this.installAbortController === null || this.installAbortController.signal.aborted) return false;
    this.installAbortController.abort();
    return true;
  }

  disable(): LocalNarratorControllerSnapshot {
    this.operationEpoch += 1;
    this.abortInstall();
    this.disableClient();
    this.clearVisibleState();
    this.capability = null;
    this.consented = false;
    this.progress = null;
    this.error = null;
    try {
      this.dependencies.storage.removeItem(localNarratorConsentStorageKey);
      this.phase = "off";
    } catch {
      this.phase = "failed";
      this.error = Object.freeze({
        code: "consent-clear-failed",
        message: "The saved local narrator preference could not be cleared.",
      });
    }
    this.publish();
    return this.currentSnapshot;
  }

  async remove(): Promise<LocalNarratorControllerSnapshot> {
    const pendingInstall = this.installTask;
    this.disable();
    if (pendingInstall !== null) await pendingInstall.catch(() => this.currentSnapshot);
    try {
      await this.dependencies.assetStore.remove();
    } catch {
      this.fail("cache-remove-failed", "The local narrator model could not be removed.");
    }
    return this.currentSnapshot;
  }

  configureCampaign(campaignId: string): boolean {
    if (!isNarratorBoundedText(campaignId, 160)) {
      this.operationEpoch += 1;
      this.abortInstall();
      this.disableClient();
      this.clearVisibleState();
      this.campaignId = null;
      this.fail("invalid-campaign", "The local narrator campaign identity is invalid.");
      return false;
    }
    if (this.campaignId === campaignId) return true;
    this.operationEpoch += 1;
    this.abortInstall();
    this.disableClient();
    this.clearVisibleState();
    this.campaignId = campaignId;
    this.progress = null;
    this.error = null;
    if (this.consented && this.capability !== null) this.enableCurrentCampaign();
    else {
      this.phase = this.consented ? "needs-setup" : "off";
      this.publish();
    }
    return true;
  }

  setCampaign(campaignId: string): boolean {
    return this.configureCampaign(campaignId);
  }

  setPresentationContext(context: LocalNarratorPresentationContext): void {
    const previousSuppression = suppressionFor(this.context);
    this.context = Object.freeze({ ...context });
    const nextSuppression = suppressionFor(this.context);
    if (previousSuppression === nextSuppression) return;
    const interruptedPendingEnhancement = nextSuppression !== null
      && this.pendingEnhancementFingerprint === this.lastNarratedFingerprint
      && this.pendingEnhancementEpoch === this.presentationEpoch
      && this.rememberedLine?.source !== "model";
    this.presentationEpoch += 1;
    this.line = null;
    this.pendingEnhancementFingerprint = null;
    this.pendingEnhancementEpoch = null;
    if (interruptedPendingEnhancement) this.lastNarratedFingerprint = null;
    if (!this.enabled) {
      this.publish();
      return;
    }
    this.dependencies.client.setCurrentSource(null);
    this.dependencies.client.setSuppressed(clientSuppressionFor(nextSuppression));
    this.phase = nextSuppression === null ? "ready" : "suppressed";
    this.publish();
  }

  presentScene(job: NarratorJobV1 | null): LocalNarratorControllerSnapshot {
    if (job === null
      || !isNarratorJobV1(job)
      || job.campaignId !== this.campaignId) {
      if (this.line !== null
        || this.rememberedLine !== null
        || this.lastNarratedFingerprint !== null
        || this.pendingEnhancementFingerprint !== null) {
        this.presentationEpoch += 1;
        this.line = null;
        this.rememberedLine = null;
        this.lastNarratedFingerprint = null;
        this.pendingEnhancementFingerprint = null;
        this.pendingEnhancementEpoch = null;
        if (this.enabled) this.dependencies.client.setCurrentSource(null);
        this.publish();
      }
      return this.currentSnapshot;
    }
    if (!this.enabled || suppressionFor(this.context) !== null) return this.currentSnapshot;
    if (this.lastNarratedFingerprint === job.sourceFingerprint) {
      if (this.line === null
        && this.rememberedLine?.sourceFingerprint === job.sourceFingerprint) {
        this.line = this.rememberedLine;
        this.publish();
      }
      return this.currentSnapshot;
    }

    this.presentationEpoch += 1;
    const presentationEpoch = this.presentationEpoch;
    this.lastNarratedFingerprint = job.sourceFingerprint;
    this.pendingEnhancementFingerprint = null;
    this.pendingEnhancementEpoch = null;
    let offer: NarratorOffer;
    try {
      offer = this.dependencies.client.narrate(job);
    } catch {
      offer = {
        initial: { source: "deterministic", text: job.deterministicFallback },
        enhancement: null,
      };
    }
    this.line = Object.freeze({
      source: "deterministic",
      text: offer.initial.text,
      sourceFingerprint: job.sourceFingerprint,
    });
    this.rememberedLine = this.line;
    this.error = null;
    const enhancement = offer.enhancement;
    if (enhancement !== null) {
      this.pendingEnhancementFingerprint = job.sourceFingerprint;
      this.pendingEnhancementEpoch = presentationEpoch;
    }
    this.publish();

    if (enhancement === null) {
      this.surfaceTerminalClientFailure();
      return this.currentSnapshot;
    }
    const clearPendingEnhancement = (): void => {
      if (this.pendingEnhancementFingerprint !== job.sourceFingerprint
        || this.pendingEnhancementEpoch !== presentationEpoch) return;
      this.pendingEnhancementFingerprint = null;
      this.pendingEnhancementEpoch = null;
    };
    void enhancement.then(
      (result) => {
        clearPendingEnhancement();
        if (result === null) {
          this.surfaceTerminalClientFailure();
          return;
        }
        if (result.source !== "model"
          || !isNarratorBoundedText(result.text, narratorMaximumOutputCharacters)
          || presentationEpoch !== this.presentationEpoch
          || !this.enabled
          || suppressionFor(this.context) !== null
          || this.campaignId !== job.campaignId
          || this.lastNarratedFingerprint !== job.sourceFingerprint
          || this.line?.sourceFingerprint !== job.sourceFingerprint) return;
        this.line = Object.freeze({
          source: "model",
          text: result.text,
          sourceFingerprint: job.sourceFingerprint,
        });
        this.rememberedLine = this.line;
        this.publish();
      },
      () => {
        clearPendingEnhancement();
        this.surfaceTerminalClientFailure();
        // The deterministic line remains authoritative for non-terminal failures.
      },
    );
    return this.currentSnapshot;
  }

  present(
    job: NarratorJobV1 | null,
    eligible: boolean,
  ): LocalNarratorControllerSnapshot {
    if (this.context.cutawayActive === eligible) {
      this.setPresentationContext({
        ...this.context,
        cutawayActive: !eligible,
      });
    }
    return this.presentScene(job);
  }

  setHidden(hidden: boolean): void {
    if (this.context.documentHidden === hidden) return;
    this.setPresentationContext({
      ...this.context,
      documentHidden: hidden,
    });
  }

  dispose(): void {
    this.operationEpoch += 1;
    this.abortInstall();
    this.disableClient();
    this.clearVisibleState();
    this.capability = null;
    this.phase = "off";
    this.error = null;
    this.publish();
  }

  private async runInstall(
    operationEpoch: number,
    abortController: AbortController,
    callerSignal: AbortSignal | undefined,
    abortFromCaller: () => void,
    onProgress: ((progress: LocalNarratorAssetProgress) => void) | undefined,
  ): Promise<LocalNarratorControllerSnapshot> {
    try {
      const inspection = await this.dependencies.assetStore.download(
        abortController.signal,
        (nextProgress) => {
          if (operationEpoch !== this.operationEpoch || abortController.signal.aborted) return;
          this.progress = frozenProgress(nextProgress);
          this.publish();
          try {
            onProgress?.(this.progress);
          } catch {
            // Download progress observers cannot interrupt verified installation.
          }
        },
      );
      if (operationEpoch !== this.operationEpoch) return this.currentSnapshot;
      if (!completeAssetsAreExact(inspection)) {
        this.fail("cache-verification-failed", "The local narrator model did not pass verification.");
        return this.currentSnapshot;
      }
      try {
        this.dependencies.storage.setItem(
          localNarratorConsentStorageKey,
          localNarratorConsentRecordJson,
        );
      } catch {
        this.fail("consent-save-failed", "The local narrator preference could not be saved.");
        return this.currentSnapshot;
      }
      this.consented = true;
      this.progress = null;
      this.enableCurrentCampaign();
      return this.currentSnapshot;
    } catch {
      if (operationEpoch !== this.operationEpoch) return this.currentSnapshot;
      this.progress = null;
      if (abortController.signal.aborted) {
        this.phase = "needs-setup";
        this.error = Object.freeze({
          code: "cancelled",
          message: "The local narrator download was cancelled.",
        });
        this.publish();
      } else {
        this.fail("download-failed", "The local narrator model could not be downloaded and verified.");
      }
      return this.currentSnapshot;
    } finally {
      callerSignal?.removeEventListener("abort", abortFromCaller);
      if (this.installAbortController === abortController) this.installAbortController = null;
      if (this.installOperationEpoch === operationEpoch) {
        queueMicrotask(() => {
          if (this.installOperationEpoch !== operationEpoch) return;
          this.installOperationEpoch = null;
          this.installTask = null;
        });
      }
    }
  }

  private prepareCampaign(campaignId: string): boolean {
    return this.campaignId === campaignId || this.configureCampaign(campaignId);
  }

  private consentStateFromStorage(): "valid" | "absent" | "failed" {
    try {
      this.consented = parseLocalNarratorConsentRecord(
        this.dependencies.storage.getItem(localNarratorConsentStorageKey),
      ) !== null;
      this.error = null;
      return this.consented ? "valid" : "absent";
    } catch {
      this.consented = false;
      this.error = Object.freeze({
        code: "consent-read-failed",
        message: "The saved local narrator preference could not be read.",
      });
      this.phase = "failed";
      return "failed";
    }
  }

  private enableCurrentCampaign(): void {
    if (this.campaignId === null || this.capability === null) {
      this.fail("configuration-missing", "The local narrator is missing its campaign configuration.");
      return;
    }
    let enabled = false;
    try {
      enabled = this.dependencies.client.enableExperimental(
        this.campaignId,
        localNarratorExperimentalPolicy,
        this.capability,
      );
    } catch {
      enabled = false;
    }
    if (!enabled) {
      this.enabled = false;
      this.fail("enable-failed", "The local narrator could not be enabled on this device.");
      return;
    }
    this.enabled = true;
    const suppression = suppressionFor(this.context);
    this.dependencies.client.setSuppressed(clientSuppressionFor(suppression));
    this.phase = suppression === null ? "ready" : "suppressed";
    this.error = null;
    this.publish();
  }

  private disableClient(): void {
    this.presentationEpoch += 1;
    try {
      this.dependencies.client.disable();
    } finally {
      this.enabled = false;
    }
  }

  private abortInstall(): void {
    this.installAbortController?.abort();
    this.installAbortController = null;
  }

  private clearVisibleState(): void {
    this.presentationEpoch += 1;
    this.line = null;
    this.rememberedLine = null;
    this.lastNarratedFingerprint = null;
    this.pendingEnhancementFingerprint = null;
    this.pendingEnhancementEpoch = null;
    this.progress = null;
  }

  private fail(code: string, message: string): void {
    this.enabled = false;
    this.phase = "failed";
    this.error = Object.freeze({ code, message });
    this.publish();
  }

  private surfaceTerminalClientFailure(): boolean {
    if (!this.enabled || this.dependencies.client.state !== "failed") return false;
    this.presentationEpoch += 1;
    this.line = null;
    this.rememberedLine = null;
    this.lastNarratedFingerprint = null;
    this.pendingEnhancementFingerprint = null;
    this.pendingEnhancementEpoch = null;
    this.progress = null;
    this.dependencies.client.setCurrentSource(null);
    this.enabled = false;
    this.phase = "failed";
    this.error = Object.freeze({
      code: "worker-failed",
      message: "The on-device narrator stopped. Verify the cached model to re-enable it.",
    });
    this.publish();
    return true;
  }

  private buildSnapshot(): LocalNarratorControllerSnapshot {
    const suppression = suppressionFor(this.context);
    return Object.freeze({
      status: this.phase,
      detail: this.detail(),
      phase: this.phase,
      consented: this.consented,
      enabled: this.enabled,
      downloading: this.phase === "downloading",
      campaignId: this.campaignId,
      suppression,
      line: this.line,
      progress: this.progress,
      error: this.error,
    });
  }

  private detail(): string {
    if (this.error !== null) return this.error.message;
    switch (this.phase) {
      case "checking":
        return "Checking the verified on-device model.";
      case "needs-setup":
        return "The verified local model needs to be downloaded.";
      case "downloading":
        return this.progress === null
          ? "Preparing the verified local model download."
          : `Downloading the local model · ${Math.floor(
            (this.progress.totalBytes / this.progress.totalDownloadBytes) * 100,
          )}%`;
      case "ready":
        return "Experimental / Unrated · On-device narrator ready.";
      case "suppressed":
        return suppressionFor(this.context) === "hidden"
          ? "Narrator paused while this tab is hidden."
          : "Narrator paused outside an eligible story moment.";
      case "unsupported":
        return "This device does not meet the local narrator's current requirements.";
      case "failed":
        return "The local narrator encountered an error.";
      case "off":
        return "Local narrator is off.";
    }
  }

  private publish(): void {
    this.currentSnapshot = this.buildSnapshot();
    for (const listener of this.listeners) safeCallback(listener, this.currentSnapshot);
  }
}

export function createLocalNarratorUiController(
  dependencies: LocalNarratorControllerDependencies,
): LocalNarratorController {
  return new LocalNarratorController(dependencies);
}
