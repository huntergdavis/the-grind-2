import type { ChronicleEntry, WorldState } from "../core/types";
import {
  isCompanionFarewellPacket,
  projectCompanionFarewell,
  type CompanionFarewellPacket,
} from "../ui/companion-farewell";
import {
  isHeroLevelUpPacketV1,
  projectHeroLevelUp,
  type HeroLevelUpPacketV1,
} from "../ui/hero-level-up";
import {
  isTrapResolutionPacket,
  projectTrapResolution,
  type TrapResolutionPacket,
} from "../ui/trap-resolution";

export const cutawayRegistryVersion = 1 as const;
export const cutawayQueueCapacity = 2 as const;
export const cutawayRecipeLimit = 16 as const;
export const cutawayPhaseLimit = 8 as const;
export const cutawayFlavorLimit = 8 as const;

export type ProductionCutawayRecipeKey =
  | "trap-resolution@1"
  | "companion-farewell@1"
  | "hero-level-up@1";
export type CutawayPresentationMode = "full" | "reduced" | "still";
export type CutawayResolutionReason =
  | "registered"
  | "unknown-registry-version"
  | "unknown-recipe"
  | "packet-version-mismatch"
  | "invalid-packet-envelope";

export interface CutawayPacketEnvelope {
  readonly schemaVersion: number;
  readonly eventId: string;
  readonly tick: number;
}

export interface CutawayStaticEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly location: string;
  readonly headline: string;
  readonly action: string;
  readonly consequence: string;
}

export interface CutawayDurationBudget {
  readonly targetMs: number;
  readonly maximumMs: number;
  readonly staticHoldMs: number;
}

export interface CutawayEffectBudget {
  readonly movingActors: number;
  readonly cameraShots: number;
  readonly flavorLayers: number;
}

export interface CutawayRecipeV1 {
  readonly registryVersion: 1;
  readonly key: string;
  readonly packetSchemaVersion: number;
  readonly phaseOrder: readonly string[];
  readonly terminalPhase: string;
  readonly actorRequirements: readonly string[];
  readonly propRequirements: readonly string[];
  readonly truthCueIds: readonly string[];
  readonly allowedFlavorIds: readonly string[];
  readonly durationBudget: CutawayDurationBudget;
  readonly effectBudget: CutawayEffectBudget;
  readonly terminalTableau: string;
  readonly domEquivalentId: string;
  readonly reducedMotion: "complete-static-tableau";
  readonly repetitionFingerprintVersion: number | null;
  readonly repetitionFingerprintFields: readonly string[];
}

export interface CutawayRegistryV1 {
  readonly schemaVersion: 1;
  readonly recipes: readonly CutawayRecipeV1[];
}

export interface CutawayAdapterManifestEntry {
  readonly recipeKey: string;
  readonly domEquivalentId: string;
  readonly truthCueIds: readonly string[];
}

export interface CutawayCandidate<
  Key extends string = string,
  Packet extends CutawayPacketEnvelope = CutawayPacketEnvelope,
> {
  readonly registryVersion: 1;
  readonly recipeKey: Key;
  readonly eventId: string;
  readonly packet: Packet;
  readonly staticEnvelope: CutawayStaticEnvelopeV1;
}

export type TrapCutawayCandidate = CutawayCandidate<"trap-resolution@1", TrapResolutionPacket>;
export type FarewellCutawayCandidate = CutawayCandidate<"companion-farewell@1", CompanionFarewellPacket>;
export type HeroLevelUpCutawayCandidate = CutawayCandidate<"hero-level-up@1", HeroLevelUpPacketV1>;
export type ProductionCutawayCandidate =
  | TrapCutawayCandidate
  | FarewellCutawayCandidate
  | HeroLevelUpCutawayCandidate;
export type AnyCutawayCandidate = CutawayCandidate<string, CutawayPacketEnvelope>;

export interface CutawayResolution {
  readonly mode: "animate" | "static-chronicle";
  readonly reason: CutawayResolutionReason;
  readonly recipe: CutawayRecipeV1 | null;
  readonly staticEnvelope: CutawayStaticEnvelopeV1 | null;
}

export interface CutawayQueue {
  readonly active: AnyCutawayCandidate | null;
  readonly pending: AnyCutawayCandidate | null;
}

export type CutawayQueueAction = "start" | "queued" | "deduplicated" | "dropped" | "fallback";

export interface CutawayQueueResult {
  readonly queue: CutawayQueue;
  readonly action: CutawayQueueAction;
  readonly resolution: CutawayResolution;
}

const recipeKeys = Object.freeze([
  "registryVersion",
  "key",
  "packetSchemaVersion",
  "phaseOrder",
  "terminalPhase",
  "actorRequirements",
  "propRequirements",
  "truthCueIds",
  "allowedFlavorIds",
  "durationBudget",
  "effectBudget",
  "terminalTableau",
  "domEquivalentId",
  "reducedMotion",
  "repetitionFingerprintVersion",
  "repetitionFingerprintFields",
] as const);

function sameKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

function nonEmptyUniqueStrings(values: readonly string[], limit: number): boolean {
  return values.length > 0
    && values.length <= limit
    && values.every((value) => typeof value === "string" && value.trim() === value && value.length > 0)
    && new Set(values).size === values.length;
}

function boundedStrings(values: readonly string[], limit: number): boolean {
  return values.length <= limit
    && values.every((value) => typeof value === "string" && value.trim() === value && value.length > 0)
    && new Set(values).size === values.length;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validRecipe(recipe: CutawayRecipeV1): boolean {
  const durationKeys = ["targetMs", "maximumMs", "staticHoldMs"] as const;
  const effectKeys = ["movingActors", "cameraShots", "flavorLayers"] as const;
  return sameKeys(recipe, recipeKeys)
    && recipe.registryVersion === cutawayRegistryVersion
    && typeof recipe.key === "string"
    && /^[a-z][a-z0-9-]*@[1-9][0-9]*$/.test(recipe.key)
    && isPositiveSafeInteger(recipe.packetSchemaVersion)
    && nonEmptyUniqueStrings(recipe.phaseOrder, cutawayPhaseLimit)
    && recipe.phaseOrder.includes(recipe.terminalPhase)
    && nonEmptyUniqueStrings(recipe.actorRequirements, cutawayRecipeLimit)
    && boundedStrings(recipe.propRequirements, cutawayRecipeLimit)
    && nonEmptyUniqueStrings(recipe.truthCueIds, cutawayRecipeLimit)
    && boundedStrings(recipe.allowedFlavorIds, cutawayFlavorLimit)
    && sameKeys(recipe.durationBudget, durationKeys)
    && isPositiveSafeInteger(recipe.durationBudget.targetMs)
    && isPositiveSafeInteger(recipe.durationBudget.maximumMs)
    && recipe.durationBudget.maximumMs >= recipe.durationBudget.targetMs
    && recipe.durationBudget.maximumMs <= 30_000
    && isPositiveSafeInteger(recipe.durationBudget.staticHoldMs)
    && recipe.durationBudget.staticHoldMs <= recipe.durationBudget.targetMs
    && sameKeys(recipe.effectBudget, effectKeys)
    && isPositiveSafeInteger(recipe.effectBudget.movingActors)
    && isPositiveSafeInteger(recipe.effectBudget.cameraShots)
    && isNonNegativeSafeInteger(recipe.effectBudget.flavorLayers)
    && typeof recipe.terminalTableau === "string"
    && recipe.terminalTableau.length > 0
    && typeof recipe.domEquivalentId === "string"
    && recipe.domEquivalentId.length > 0
    && recipe.reducedMotion === "complete-static-tableau"
    && (recipe.repetitionFingerprintVersion === null
      ? recipe.repetitionFingerprintFields.length === 0
      : isPositiveSafeInteger(recipe.repetitionFingerprintVersion)
        && nonEmptyUniqueStrings(recipe.repetitionFingerprintFields, cutawayRecipeLimit));
}

function freezeCopy<Value>(value: Value): Value {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeCopy(entry))) as Value;
  }
  if (typeof value === "object" && value !== null) {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = freezeCopy(entry);
    return Object.freeze(copy) as Value;
  }
  return value;
}

export function createCutawayRegistry(recipes: readonly CutawayRecipeV1[]): CutawayRegistryV1 {
  if (recipes.length === 0 || recipes.length > cutawayRecipeLimit) {
    throw new Error("Cutaway registry size is outside the bounded contract");
  }
  const keys = new Set<string>();
  for (const recipe of recipes) {
    if (!validRecipe(recipe)) throw new Error(`Invalid cutaway recipe: ${recipe.key}`);
    if (keys.has(recipe.key)) throw new Error(`Duplicate cutaway recipe: ${recipe.key}`);
    keys.add(recipe.key);
  }
  return Object.freeze({
    schemaVersion: cutawayRegistryVersion,
    recipes: Object.freeze(recipes.map((recipe) => freezeCopy(recipe))),
  });
}

export function validateCutawayAdapterManifest(
  registry: CutawayRegistryV1,
  manifest: readonly CutawayAdapterManifestEntry[],
): boolean {
  if (manifest.length !== registry.recipes.length) return false;
  const keys = new Set(manifest.map((entry) => entry.recipeKey));
  if (keys.size !== manifest.length) return false;
  return registry.recipes.every((recipe) => {
    const entry = manifest.find((candidate) => candidate.recipeKey === recipe.key);
    if (entry === undefined || entry.domEquivalentId !== recipe.domEquivalentId) return false;
    const expected = [...recipe.truthCueIds].sort();
    const actual = [...entry.truthCueIds].sort();
    return actual.length === expected.length
      && actual.every((truthCueId, index) => truthCueId === expected[index]);
  });
}

const trapRecipe: CutawayRecipeV1 = {
  registryVersion: 1,
  key: "trap-resolution@1",
  packetSchemaVersion: 1,
  phaseOrder: ["command", "inspection", "attempt", "reveal", "consequence", "final"],
  terminalPhase: "final",
  actorRequirements: ["equipped-hero"],
  propRequirements: ["dungeon-mechanism", "check-tableau"],
  truthCueIds: [
    "trap-cutaway-command",
    "trap-cutaway-inspection",
    "trap-cutaway-check",
    "trap-cutaway-result",
    "trap-cutaway-consequence",
    "trap-cutaway-progress",
  ],
  allowedFlavorIds: ["boot-stop", "wire-curl", "rune-wobble"],
  durationBudget: { targetMs: 8_000, maximumMs: 11_000, staticHoldMs: 1_200 },
  effectBudget: { movingActors: 1, cameraShots: 3, flavorLayers: 1 },
  terminalTableau: "resolved-mechanism-with-check-and-consequence",
  domEquivalentId: "trap-cutaway",
  reducedMotion: "complete-static-tableau",
  repetitionFingerprintVersion: 1,
  repetitionFingerprintFields: ["trapKind", "stage", "phaseAfter", "completedExit"],
};

const farewellRecipe: CutawayRecipeV1 = {
  registryVersion: 1,
  key: "companion-farewell@1",
  packetSchemaVersion: 1,
  phaseOrder: ["promise", "journey", "arrival", "farewell", "legacy", "final"],
  terminalPhase: "final",
  actorRequirements: ["equipped-hero", "departing-companion"],
  propRequirements: ["profession-tools", "destination-road"],
  truthCueIds: [
    "farewell-cutaway-promise",
    "farewell-cutaway-journey",
    "farewell-cutaway-arrival",
    "farewell-cutaway-departure",
    "farewell-cutaway-legacy",
    "farewell-cutaway-progress",
  ],
  allowedFlavorIds: [],
  durationBudget: { targetMs: 8_000, maximumMs: 11_000, staticHoldMs: 1_200 },
  effectBudget: { movingActors: 2, cameraShots: 1, flavorLayers: 0 },
  terminalTableau: "hero-witnesses-companion-departure",
  domEquivalentId: "farewell-cutaway",
  reducedMotion: "complete-static-tableau",
  repetitionFingerprintVersion: null,
  repetitionFingerprintFields: [],
};

const heroLevelUpRecipe: CutawayRecipeV1 = {
  registryVersion: 1,
  key: "hero-level-up@1",
  packetSchemaVersion: 1,
  phaseOrder: ["source", "threshold", "ascent", "mechanics", "tableau", "final"],
  terminalPhase: "final",
  actorRequirements: ["equipped-hero"],
  propRequirements: ["earned-thresholds", "mechanical-facts", "final-equipment"],
  truthCueIds: [
    "level-up-cutaway-source",
    "level-up-cutaway-threshold",
    "level-up-cutaway-level",
    "level-up-cutaway-mechanics",
    "level-up-cutaway-tableau",
    "level-up-cutaway-progress",
  ],
  allowedFlavorIds: [],
  durationBudget: { targetMs: 8_000, maximumMs: 11_000, staticHoldMs: 1_200 },
  effectBudget: { movingActors: 1, cameraShots: 2, flavorLayers: 0 },
  terminalTableau: "equipped-hero-with-earned-level-and-mechanical-facts",
  domEquivalentId: "level-up-cutaway",
  reducedMotion: "complete-static-tableau",
  repetitionFingerprintVersion: null,
  repetitionFingerprintFields: [],
};

export const cutawayRegistry = createCutawayRegistry([trapRecipe, farewellRecipe, heroLevelUpRecipe]);

function validPacketEnvelope(packet: CutawayPacketEnvelope): boolean {
  return Number.isSafeInteger(packet.schemaVersion)
    && packet.schemaVersion > 0
    && typeof packet.eventId === "string"
    && packet.eventId.length > 0
    && Number.isSafeInteger(packet.tick)
    && packet.tick >= 0;
}

function validProductionPacket(recipeKey: string, packet: CutawayPacketEnvelope): boolean {
  if (recipeKey === "trap-resolution@1") return isTrapResolutionPacket(packet);
  if (recipeKey === "companion-farewell@1") return isCompanionFarewellPacket(packet);
  if (recipeKey === "hero-level-up@1") return isHeroLevelUpPacketV1(packet);
  return true;
}

function validStaticEnvelope(envelope: CutawayStaticEnvelopeV1): boolean {
  const text = [envelope.location, envelope.headline, envelope.action, envelope.consequence];
  return envelope.schemaVersion === 1
    && typeof envelope.eventId === "string"
    && envelope.eventId.length > 0
    && Number.isSafeInteger(envelope.tick)
    && envelope.tick >= 0
    && text.every((value) => typeof value === "string" && value.length > 0 && value.length <= 1_000);
}

function staticEnvelopeFromSource(source: ChronicleEntry): CutawayStaticEnvelopeV1 {
  return Object.freeze({
    schemaVersion: 1,
    eventId: source.id,
    tick: source.tick,
    location: source.location,
    headline: source.headline,
    action: source.action,
    consequence: source.consequence,
  });
}

export function createCutawayCandidate<
  Key extends string,
  Packet extends CutawayPacketEnvelope,
>(
  recipeKey: Key,
  packet: Packet,
  staticEnvelope: CutawayStaticEnvelopeV1,
): CutawayCandidate<Key, Packet> {
  const ownedPacket = freezeCopy(packet);
  const ownedStaticEnvelope = freezeCopy(staticEnvelope);
  return Object.freeze({
    registryVersion: cutawayRegistryVersion,
    recipeKey,
    eventId: ownedPacket.eventId,
    packet: ownedPacket,
    staticEnvelope: ownedStaticEnvelope,
  });
}

export function resolveCutawayCandidate(
  registry: CutawayRegistryV1,
  candidate: AnyCutawayCandidate,
): CutawayResolution {
  const staticEnvelope = validStaticEnvelope(candidate.staticEnvelope)
    && candidate.staticEnvelope.eventId === candidate.eventId
    && candidate.staticEnvelope.tick === candidate.packet.tick
    ? candidate.staticEnvelope
    : null;
  if (candidate.registryVersion !== registry.schemaVersion) {
    return Object.freeze({ mode: "static-chronicle", reason: "unknown-registry-version", recipe: null, staticEnvelope });
  }
  const recipe = registry.recipes.find((entry) => entry.key === candidate.recipeKey) ?? null;
  if (recipe === null) {
    return Object.freeze({ mode: "static-chronicle", reason: "unknown-recipe", recipe: null, staticEnvelope });
  }
  if (!validPacketEnvelope(candidate.packet)
    || candidate.eventId !== candidate.packet.eventId
    || staticEnvelope === null) {
    return Object.freeze({ mode: "static-chronicle", reason: "invalid-packet-envelope", recipe, staticEnvelope });
  }
  if (candidate.packet.schemaVersion !== recipe.packetSchemaVersion) {
    return Object.freeze({ mode: "static-chronicle", reason: "packet-version-mismatch", recipe, staticEnvelope });
  }
  if (!validProductionPacket(candidate.recipeKey, candidate.packet)) {
    return Object.freeze({ mode: "static-chronicle", reason: "invalid-packet-envelope", recipe, staticEnvelope });
  }
  return Object.freeze({ mode: "animate", reason: "registered", recipe, staticEnvelope });
}

function fingerprintValue(value: unknown): string | null {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return null;
}

/** A semantic fatigue key; event/tick identity remains separate and is never included. */
export function cutawayRepetitionFingerprint(
  registry: CutawayRegistryV1,
  candidate: AnyCutawayCandidate,
): string | null {
  const resolution = resolveCutawayCandidate(registry, candidate);
  const recipe = resolution.mode === "animate" ? resolution.recipe : null;
  if (recipe?.repetitionFingerprintVersion === null || recipe === null) return null;
  const packet = candidate.packet as unknown as Record<string, unknown>;
  const fields: string[] = [];
  for (const field of recipe.repetitionFingerprintFields) {
    const value = fingerprintValue(packet[field]);
    if (value === null) return null;
    fields.push(`${field}=${value}`);
  }
  return `${recipe.key}|v${recipe.repetitionFingerprintVersion}|${fields.join("|")}`;
}

export function createCutawayQueue(): CutawayQueue {
  return Object.freeze({ active: null, pending: null });
}

function candidateIdentity(candidate: AnyCutawayCandidate): string {
  return `${candidate.recipeKey}:${candidate.eventId}`;
}

export function offerCutaway(
  registry: CutawayRegistryV1,
  queue: CutawayQueue,
  candidate: AnyCutawayCandidate,
): CutawayQueueResult {
  const resolution = resolveCutawayCandidate(registry, candidate);
  if (resolution.mode !== "animate") {
    return Object.freeze({ queue, action: "fallback", resolution });
  }
  const identity = candidateIdentity(candidate);
  if ((queue.active !== null && candidateIdentity(queue.active) === identity)
    || (queue.pending !== null && candidateIdentity(queue.pending) === identity)) {
    return Object.freeze({ queue, action: "deduplicated", resolution });
  }
  if (queue.active === null) {
    return Object.freeze({
      queue: Object.freeze({ active: candidate, pending: null }),
      action: "start",
      resolution,
    });
  }
  if (queue.pending === null) {
    return Object.freeze({
      queue: Object.freeze({ active: queue.active, pending: candidate }),
      action: "queued",
      resolution,
    });
  }
  return Object.freeze({ queue, action: "dropped", resolution });
}

export function completeCutaway(queue: CutawayQueue): CutawayQueue {
  return Object.freeze({ active: queue.pending, pending: null });
}

export function discardPendingCutaway(queue: CutawayQueue): CutawayQueue {
  if (queue.pending === null) return queue;
  return Object.freeze({ active: queue.active, pending: null });
}

export function projectCutawayCandidates(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): readonly ProductionCutawayCandidate[] {
  const trap = projectTrapResolution(before, after, source);
  const farewell = projectCompanionFarewell(before, after, source);
  const levelUp = projectHeroLevelUp(before, after, source);
  if (trap !== null && farewell !== null) return Object.freeze([]);
  const staticEnvelope = staticEnvelopeFromSource(source);
  const candidates: ProductionCutawayCandidate[] = [];
  if (trap !== null) candidates.push(createCutawayCandidate("trap-resolution@1", trap, staticEnvelope));
  else if (farewell !== null) candidates.push(createCutawayCandidate("companion-farewell@1", farewell, staticEnvelope));
  if (levelUp !== null) candidates.push(createCutawayCandidate("hero-level-up@1", levelUp, staticEnvelope));
  return Object.freeze(candidates);
}
