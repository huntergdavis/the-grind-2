import type { WorldState } from "./types";
import { upgradeWorldState } from "./simulation";

const databaseName = "the-grind-2";
const databaseVersion = 1;
const campaignStore = "campaigns";
const settingStore = "settings";
const activeCampaignKey = "activeCampaignId";
const sessionPrefix = "the-grind-2:";
const campaignSessionPrefix = `${sessionPrefix}campaign:`;

function sessionKey(campaignId: string): string {
  return `${campaignSessionPrefix}${campaignId}`;
}

function readSession(campaignId: string): WorldState | undefined {
  const value = sessionStorage.getItem(sessionKey(campaignId));
  if (value === null) return undefined;
  try {
    return upgradeWorldState(JSON.parse(value));
  } catch {
    sessionStorage.removeItem(sessionKey(campaignId));
    return undefined;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

export class CampaignRepository {
  private readonly database: Promise<IDBDatabase>;

  constructor() {
    this.database = this.open();
  }

  private async open(): Promise<IDBDatabase> {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(campaignStore)) {
        database.createObjectStore(campaignStore, { keyPath: "campaignId" });
      }
      if (!database.objectStoreNames.contains(settingStore)) {
        database.createObjectStore(settingStore);
      }
    });
    return requestResult(request);
  }

  async save(state: WorldState, makeActive = true): Promise<void> {
    sessionStorage.setItem(sessionKey(state.campaignId), JSON.stringify(state));
    if (makeActive) sessionStorage.setItem(`${sessionPrefix}${activeCampaignKey}`, state.campaignId);

    const database = await this.database;
    const transaction = database.transaction(
      [campaignStore, settingStore],
      "readwrite",
    );
    transaction.objectStore(campaignStore).put(state);
    if (makeActive) {
      transaction.objectStore(settingStore).put(state.campaignId, activeCampaignKey);
    }
    await transactionDone(transaction);
  }

  async load(campaignId: string): Promise<WorldState | undefined> {
    const sessionState = readSession(campaignId);
    if (sessionState !== undefined) return sessionState;

    const database = await this.database;
    const transaction = database.transaction(campaignStore, "readonly");
    const result = await requestResult(
      transaction.objectStore(campaignStore).get(campaignId) as IDBRequest<
        unknown
      >,
    );
    await transactionDone(transaction);
    return result === undefined ? undefined : upgradeWorldState(result);
  }

  async loadActive(): Promise<WorldState | undefined> {
    const sessionCampaignId = sessionStorage.getItem(`${sessionPrefix}${activeCampaignKey}`);
    if (sessionCampaignId !== null) {
      const sessionState = readSession(sessionCampaignId);
      if (sessionState !== undefined) return sessionState;
    }

    const database = await this.database;
    const transaction = database.transaction(settingStore, "readonly");
    const campaignId = await requestResult(
      transaction.objectStore(settingStore).get(activeCampaignKey) as IDBRequest<
        string | undefined
      >,
    );
    await transactionDone(transaction);
    return campaignId === undefined ? undefined : this.load(campaignId);
  }

  async list(): Promise<WorldState[]> {
    const database = await this.database;
    const transaction = database.transaction(campaignStore, "readonly");
    const campaigns = await requestResult(
      transaction.objectStore(campaignStore).getAll() as IDBRequest<unknown[]>,
    );
    await transactionDone(transaction);
    const upgraded = campaigns.map(upgradeWorldState);
    const merged = new Map(upgraded.map((campaign) => [campaign.campaignId, campaign]));
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key === null || !key.startsWith(campaignSessionPrefix)) continue;
      const campaign = readSession(key.slice(campaignSessionPrefix.length));
      if (campaign !== undefined) merged.set(campaign.campaignId, campaign);
    }
    return [...merged.values()].sort((left, right) =>
      left.hero.name.localeCompare(right.hero.name),
    );
  }
}
