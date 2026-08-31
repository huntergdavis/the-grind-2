import { canonicalStringify } from "./canonical";
import { isValidChampionInduction } from "./champions";
import type { ChampionInduction, WorldState } from "./types";
import { upgradeWorldState } from "./simulation";

const databaseName = "the-grind-2";
const databaseVersion = 2;
const campaignStore = "campaigns";
const settingStore = "settings";
const championStore = "champions";
const activeCampaignKey = "activeCampaignId";
const sessionPrefix = "the-grind-2:";
const campaignSessionPrefix = `${sessionPrefix}campaign:`;
const championSessionPrefix = `${sessionPrefix}champion:`;

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

function championSessionKey(championId: string): string {
  return `${championSessionPrefix}${championId}`;
}

function readChampionSession(championId: string): ChampionInduction | undefined {
  const value = sessionStorage.getItem(championSessionKey(championId));
  if (value === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (isValidChampionInduction(parsed)) return parsed;
  } catch {
    // The malformed disposable mirror is removed below.
  }
  sessionStorage.removeItem(championSessionKey(championId));
  return undefined;
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
      if (!database.objectStoreNames.contains(championStore)) {
        database.createObjectStore(championStore, { keyPath: "id" });
      }
    });
    return requestResult(request);
  }

  async save(state: WorldState, makeActive = true): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(
      [campaignStore, settingStore, championStore],
      "readwrite",
    );
    const completed = transactionDone(transaction);
    transaction.objectStore(campaignStore).put(state);
    if (makeActive) {
      transaction.objectStore(settingStore).put(state.campaignId, activeCampaignKey);
    }
    try {
      const induction = state.championInduction;
      if (induction !== null) {
        if (!isValidChampionInduction(induction)) {
          transaction.abort();
          throw new TypeError("Champion induction violates archive invariants");
        }
        const store = transaction.objectStore(championStore);
        const existing = await requestResult(store.get(induction.id) as IDBRequest<unknown>);
        if (existing === undefined) {
          store.add(induction);
        } else if (
          !isValidChampionInduction(existing) ||
          canonicalStringify(existing) !== canonicalStringify(induction)
        ) {
          transaction.abort();
          throw new Error("An immutable Hall of Champions record cannot be replaced");
        }
      }
      await completed;
    } catch (cause) {
      await completed.catch(() => undefined);
      throw cause;
    }

    sessionStorage.setItem(sessionKey(state.campaignId), JSON.stringify(state));
    if (makeActive) sessionStorage.setItem(`${sessionPrefix}${activeCampaignKey}`, state.campaignId);
    if (state.championInduction !== null) {
      sessionStorage.setItem(
        championSessionKey(state.championInduction.id),
        JSON.stringify(state.championInduction),
      );
    }
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

  async listChampions(): Promise<ChampionInduction[]> {
    const database = await this.database;
    const transaction = database.transaction(championStore, "readonly");
    const stored = await requestResult(
      transaction.objectStore(championStore).getAll() as IDBRequest<unknown[]>,
    );
    await transactionDone(transaction);
    const merged = new Map<string, ChampionInduction>();
    for (const candidate of stored) {
      if (isValidChampionInduction(candidate)) merged.set(candidate.id, candidate);
    }
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key === null || !key.startsWith(championSessionPrefix)) continue;
      const champion = readChampionSession(key.slice(championSessionPrefix.length));
      if (champion !== undefined && !merged.has(champion.id)) merged.set(champion.id, champion);
    }
    return [...merged.values()].sort((left, right) =>
      right.recordedTick - left.recordedTick ||
      (left.heroName < right.heroName ? -1 : left.heroName > right.heroName ? 1 : 0) ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    );
  }
}
