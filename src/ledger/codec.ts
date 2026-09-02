import {
  adventureEventSchemaVersion,
  maximumAdventureDictionaryEntries,
  maximumAdventureEventsPerSegment,
  maximumAdventureReferencesPerEvent,
  maximumAdventureSegmentBytes,
  maximumAdventureStringBytes,
  type AdventureEvent,
  type AdventureEventPayloads,
  type AdventureEventType,
  type LedgerAbilityProgressSource,
  type LedgerCombatAction,
  type LedgerCombatEffectKind,
  type LedgerCombatOutcome,
  type LedgerCommandType,
  type LedgerCurrency,
  type LedgerDirection,
  type LedgerResource,
} from "./types";

const segmentMagic = [0x54, 0x47, 0x32, 0x45] as const;
const segmentCodecVersion = 1;
const checksumBytes = 4;
const maximumBodyBytes = maximumAdventureSegmentBytes - checksumBytes;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// Codes are append-only and must never be reassigned or reused in later schemas.
const eventTypeCodes = {
  "campaign.started": 1,
  "command.applied": 2,
  "route.planned": 3,
  "travel.edge-advanced": 4,
  "town.visited": 5,
  "dungeon.entered": 6,
  "dungeon.moved": 7,
  "combat.started": 8,
  "combat.action": 9,
  "combat.effect": 10,
  "combat.ended": 11,
  "monster.observed": 12,
  "monster.insight-gained": 13,
  "ability.progressed": 14,
  "ability.learned": 15,
  "quest.progressed": 16,
  "actor.recovered": 17,
  "item.acquired": 18,
  "equipment.changed": 19,
  "hero.progressed": 20,
  "currency.changed": 21,
  "dungeon.trap-triggered": 22,
  "quest.fulfilled": 23,
  "quest.reward-applied": 24,
  "quest.admitted": 25,
  "quest.lead-revealed": 26,
  "hero.growth-selected": 27,
  "item.consumed": 28,
  "equipment.mastery-earned": 29,
} as const satisfies Record<AdventureEventType, number>;

const commandTypeCodes = {
  "plan-route": 1,
  travel: 2,
  "visit-town": 3,
  "enter-dungeon": 4,
  "move-dungeon": 5,
  "start-combat": 6,
  "combat-action": 7,
  "train-ability": 8,
  "progress-objective": 9,
  wait: 10,
  "disarm-dungeon-trap": 11,
  "start-counter-duel": 12,
  "counter-duel-action": 13,
  "unlock-dungeon-gate": 14,
  "fulfill-quest": 15,
  "apply-quest-reward": 16,
  "admit-successor-quest": 17,
  "invoke-dungeon-shrine": 18,
} as const satisfies Record<LedgerCommandType, number>;

const directionCodes = { north: 1, east: 2, south: 3, west: 4 } as const satisfies Record<LedgerDirection, number>;
const combatActionCodes = { attack: 1, guard: 2, ability: 3, item: 4 } as const satisfies Record<LedgerCombatAction, number>;
const combatOutcomeCodes = { victory: 1, defeat: 2, stalemate: 3 } as const satisfies Record<LedgerCombatOutcome, number>;
const combatEffectCodes = {
  damage: 1,
  healing: 2,
  "mana-spent": 3,
  guarded: 4,
  "status-applied": 5,
  "status-tick": 6,
  "status-expired": 7,
  defeated: 8,
} as const satisfies Record<LedgerCombatEffectKind, number>;
const resourceCodes = { health: 1, mana: 2, guard: 3 } as const satisfies Record<LedgerResource, number>;
const abilityProgressSourceCodes = { combat: 1, training: 2 } as const satisfies Record<LedgerAbilityProgressSource, number>;
const currencyCodes = { gold: 1 } as const satisfies Record<LedgerCurrency, number>;

export const adventureCodecCodeManifest = Object.freeze({
  events: eventTypeCodes,
  commands: commandTypeCodes,
  directions: directionCodes,
  combatActions: combatActionCodes,
  combatOutcomes: combatOutcomeCodes,
  combatEffects: combatEffectCodes,
  resources: resourceCodes,
  abilityProgressSources: abilityProgressSourceCodes,
  currencies: currencyCodes,
});

function buildReverseCodes<TValue extends string>(
  codes: Readonly<Record<TValue, number>>,
  label: string,
): ReadonlyMap<number, TValue> {
  const reverse = new Map<number, TValue>();
  for (const [key, value] of Object.entries(codes) as [TValue, number][]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${label} code must be a positive integer`);
    if (reverse.has(value)) throw new TypeError(`${label} code ${value} is duplicated`);
    reverse.set(value, key);
  }
  return reverse;
}

const eventTypesByCode = buildReverseCodes(eventTypeCodes, "event type");
const commandTypesByCode = buildReverseCodes(commandTypeCodes, "command type");
const directionsByCode = buildReverseCodes(directionCodes, "direction");
const combatActionsByCode = buildReverseCodes(combatActionCodes, "combat action");
const combatOutcomesByCode = buildReverseCodes(combatOutcomeCodes, "combat outcome");
const combatEffectsByCode = buildReverseCodes(combatEffectCodes, "combat effect");
const resourcesByCode = buildReverseCodes(resourceCodes, "resource");
const abilityProgressSourcesByCode = buildReverseCodes(abilityProgressSourceCodes, "ability progress source");
const currenciesByCode = buildReverseCodes(currencyCodes, "currency");

class ByteWriter {
  private values = new Uint8Array(256);
  private offset = 0;

  constructor(private readonly limit = maximumBodyBytes) {}

  get length(): number {
    return this.offset;
  }

  private ensure(additional: number): void {
    if (!Number.isSafeInteger(additional) || additional < 0 || this.offset + additional > this.limit) {
      throw new RangeError("Adventure segment exceeds byte limit");
    }
    if (this.offset + additional <= this.values.byteLength) return;
    let capacity = this.values.byteLength;
    while (capacity < this.offset + additional) capacity = Math.min(this.limit, capacity * 2);
    if (capacity < this.offset + additional) throw new RangeError("Adventure segment exceeds byte limit");
    const grown = new Uint8Array(capacity);
    grown.set(this.values.subarray(0, this.offset));
    this.values = grown;
  }

  writeByte(value: number): void {
    this.ensure(1);
    this.values[this.offset] = value & 0xff;
    this.offset += 1;
  }

  writeBytes(values: Uint8Array | readonly number[]): void {
    this.ensure(values.length);
    this.values.set(values, this.offset);
    this.offset += values.length;
  }

  writeVarint(value: number): void {
    assertUnsignedInteger(value, "varint");
    let remaining = value;
    while (remaining >= 0x80) {
      this.writeByte((remaining % 0x80) | 0x80);
      remaining = Math.floor(remaining / 0x80);
    }
    this.writeByte(remaining);
  }

  toUint8Array(): Uint8Array {
    return this.values.slice(0, this.offset);
  }
}

class ByteReader {
  private offset = 0;

  constructor(private readonly values: Uint8Array) {}

  get remaining(): number {
    return this.values.length - this.offset;
  }

  readByte(): number {
    const value = this.values[this.offset];
    if (value === undefined) throw new RangeError("Adventure segment is truncated");
    this.offset += 1;
    return value;
  }

  readBytes(length: number): Uint8Array {
    assertUnsignedInteger(length, "byte length");
    if (length > this.remaining) throw new RangeError("Adventure segment is truncated");
    const start = this.offset;
    this.offset += length;
    return this.values.subarray(start, this.offset);
  }

  readVarint(): number {
    let value = 0;
    let multiplier = 1;
    let count = 0;
    while (count < 8) {
      const byte = this.readByte();
      count += 1;
      value += (byte & 0x7f) * multiplier;
      if (!Number.isSafeInteger(value)) throw new RangeError("Adventure varint exceeds safe integer range");
      if ((byte & 0x80) === 0) {
        if (varintByteLength(value) !== count) throw new RangeError("Adventure varint is not canonical");
        return value;
      }
      multiplier *= 0x80;
    }
    throw new RangeError("Adventure varint is too long");
  }

  expectEnd(context: string): void {
    if (this.remaining !== 0) throw new RangeError(`${context} contains unknown trailing fields`);
  }
}

function varintByteLength(value: number): number {
  assertUnsignedInteger(value, "varint");
  let remaining = value;
  let length = 1;
  while (remaining >= 0x80) {
    remaining = Math.floor(remaining / 0x80);
    length += 1;
  }
  return length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertUnsignedInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
}

function assertSignedInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || Math.abs(value as number) > Math.floor(Number.MAX_SAFE_INTEGER / 2)) {
    throw new TypeError(`${label} must be a safely encodable signed integer`);
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  assertUnsignedInteger(value, label);
  if (value === 0) throw new RangeError(`${label} must be positive`);
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  const bytes = encoder.encode(value);
  if (bytes.byteLength > maximumAdventureStringBytes) throw new RangeError(`${label} exceeds the UTF-8 byte limit`);
  if (decoder.decode(bytes) !== value) throw new TypeError(`${label} is not canonical UTF-8`);
}

function assertNullableString(value: unknown, label: string): asserts value is string | null {
  if (value !== null) assertString(value, label);
}

function assertNullableUnsignedInteger(value: unknown, label: string): asserts value is number | null {
  if (value !== null) {
    assertUnsignedInteger(value, label);
    if (value === Number.MAX_SAFE_INTEGER) throw new RangeError(`${label} cannot be encoded as nullable`);
  }
}

function assertExactKeys(value: unknown, expected: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} fields do not match schema`);
  }
}

function assertEnum<TValue extends string>(
  value: unknown,
  codes: Readonly<Record<TValue, number>>,
  label: string,
): asserts value is TValue {
  if (typeof value !== "string" || !Object.hasOwn(codes, value)) throw new TypeError(`${label} is unknown`);
}

function assertStringList(value: unknown, label: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumAdventureReferencesPerEvent) {
    throw new RangeError(`${label} count is outside bounds`);
  }
  for (const entry of value) assertString(entry, label);
}

function assertCauseSequences(value: unknown, sequence: number): asserts value is readonly number[] {
  if (!Array.isArray(value) || value.length > maximumAdventureReferencesPerEvent) {
    throw new RangeError("causeSequences exceeds the reference limit");
  }
  let previous = 0;
  for (const cause of value) {
    assertPositiveInteger(cause, "cause sequence");
    if (cause >= sequence) throw new RangeError("cause sequence must precede its event");
    if (cause <= previous) throw new RangeError("cause sequences must be unique and strictly increasing");
    previous = cause;
  }
}

function assertActor(event: AdventureEvent): void {
  const systemActorAllowed = new Set<AdventureEventType>(["combat.started", "combat.effect", "combat.ended", "currency.changed"]);
  if (!systemActorAllowed.has(event.type) && event.actorId === null) throw new TypeError(`${event.type} requires an actor`);
  if (event.type === "campaign.started" && event.actorId !== event.payload.heroId) {
    throw new TypeError("campaign actor must be the initial hero");
  }
}

function weaponUseLevelForLedgerExperience(experience: number): number {
  const floors = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45] as const;
  let level = 1;
  for (let index = 1; index < floors.length; index += 1) {
    if (experience < (floors[index] ?? Number.MAX_SAFE_INTEGER)) break;
    level = index + 1;
  }
  return level;
}

function assertPayload(event: AdventureEvent): void {
  const payload: unknown = event.payload;
  switch (event.type) {
    case "campaign.started":
      assertExactKeys(payload, ["seed", "rulesetVersion", "generatorVersion", "worldSchemaVersion", "depthSchemaVersion", "initialStateHash", "heroId", "locationId"], event.type);
      assertUnsignedInteger(payload.seed, "seed");
      for (const key of ["rulesetVersion", "generatorVersion", "worldSchemaVersion", "depthSchemaVersion", "initialStateHash", "heroId", "locationId"] as const) assertString(payload[key], key);
      return;
    case "command.applied":
      assertExactKeys(payload, ["commandType"], event.type);
      assertEnum(payload.commandType, commandTypeCodes, "commandType");
      return;
    case "route.planned":
      assertExactKeys(payload, ["originLocationId", "destinationId", "legs", "distance", "routeHash"], event.type);
      assertString(payload.originLocationId, "originLocationId");
      assertString(payload.destinationId, "destinationId");
      assertPositiveInteger(payload.legs, "route legs");
      assertPositiveInteger(payload.distance, "route distance");
      assertString(payload.routeHash, "routeHash");
      return;
    case "travel.edge-advanced":
      assertExactKeys(payload, ["edgeId", "progressBefore", "progressAfter", "reachedLocationId", "routeCompleted"], event.type);
      assertString(payload.edgeId, "edgeId");
      assertUnsignedInteger(payload.progressBefore, "progressBefore");
      assertPositiveInteger(payload.progressAfter, "progressAfter");
      if (payload.progressAfter <= payload.progressBefore) throw new RangeError("travel progress must advance");
      assertNullableString(payload.reachedLocationId, "reachedLocationId");
      assertBoolean(payload.routeCompleted, "routeCompleted");
      if (payload.routeCompleted && payload.reachedLocationId === null) throw new TypeError("completed route requires a reached location");
      return;
    case "town.visited":
      assertExactKeys(payload, ["townId", "visit", "reputationAfter"], event.type);
      assertString(payload.townId, "townId");
      assertPositiveInteger(payload.visit, "town visit");
      assertUnsignedInteger(payload.reputationAfter, "reputationAfter");
      return;
    case "dungeon.entered":
      assertExactKeys(payload, ["dungeonId", "width", "height", "layoutVersion", "layoutHash"], event.type);
      assertString(payload.dungeonId, "dungeonId");
      assertPositiveInteger(payload.width, "dungeon width");
      assertPositiveInteger(payload.height, "dungeon height");
      assertString(payload.layoutVersion, "layoutVersion");
      assertString(payload.layoutHash, "layoutHash");
      return;
    case "dungeon.moved":
      assertExactKeys(payload, ["dungeonId", "fromCellId", "toCellId", "direction", "firstVisit", "feature", "completed"], event.type);
      assertString(payload.dungeonId, "dungeonId");
      assertString(payload.fromCellId, "fromCellId");
      assertString(payload.toCellId, "toCellId");
      assertEnum(payload.direction, directionCodes, "dungeon direction");
      assertBoolean(payload.firstVisit, "firstVisit");
      assertNullableString(payload.feature, "feature");
      assertBoolean(payload.completed, "completed");
      return;
    case "dungeon.trap-triggered":
      assertExactKeys(payload, ["dungeonId", "cellId", "damage", "healthBefore", "healthAfter"], event.type);
      assertString(payload.dungeonId, "dungeonId");
      assertString(payload.cellId, "cellId");
      assertPositiveInteger(payload.damage, "trap damage");
      assertPositiveInteger(payload.healthBefore, "healthBefore");
      assertUnsignedInteger(payload.healthAfter, "healthAfter");
      if (payload.healthAfter >= payload.healthBefore || payload.damage !== payload.healthBefore - payload.healthAfter) {
        throw new RangeError("trap damage must equal the exact health decrease");
      }
      return;
    case "combat.started":
      assertExactKeys(payload, ["combatId", "enemySpeciesIds"], event.type);
      assertString(payload.combatId, "combatId");
      assertStringList(payload.enemySpeciesIds, "enemySpeciesIds");
      return;
    case "combat.action":
      assertExactKeys(payload, ["combatId", "round", "turn", "action", "targetId", "abilityId", "manaCost"], event.type);
      assertString(payload.combatId, "combatId");
      assertPositiveInteger(payload.round, "combat round");
      assertPositiveInteger(payload.turn, "combat turn");
      assertEnum(payload.action, combatActionCodes, "combat action");
      assertNullableString(payload.targetId, "targetId");
      assertNullableString(payload.abilityId, "abilityId");
      assertUnsignedInteger(payload.manaCost, "manaCost");
      if (payload.action === "guard" && (payload.targetId !== null || payload.abilityId !== null || payload.manaCost !== 0)) throw new TypeError("guard cannot retain a target, ability, or mana cost");
      if (payload.action === "attack" && (payload.targetId === null || payload.abilityId !== null || payload.manaCost !== 0)) throw new TypeError("attack requires a target and no ability or mana cost");
      if (payload.action === "ability" && (payload.targetId === null || payload.abilityId === null)) throw new TypeError("ability requires target and ability IDs");
      if (payload.action === "item" && (payload.targetId === null || payload.targetId !== event.actorId || payload.abilityId !== null || payload.manaCost !== 0)) throw new TypeError("item use requires a self target and no ability or mana cost");
      return;
    case "combat.effect": {
      assertExactKeys(payload, ["combatId", "kind", "targetId", "resource", "amount", "resourceAfter", "statusId", "statusDurationAfter", "statusPotencyAfter"], event.type);
      assertString(payload.combatId, "combatId");
      assertEnum(payload.kind, combatEffectCodes, "combat effect");
      assertString(payload.targetId, "targetId");
      if (payload.resource !== null) assertEnum(payload.resource, resourceCodes, "resource");
      assertUnsignedInteger(payload.amount, "effect amount");
      assertNullableUnsignedInteger(payload.resourceAfter, "resourceAfter");
      assertNullableString(payload.statusId, "statusId");
      assertNullableUnsignedInteger(payload.statusDurationAfter, "statusDurationAfter");
      assertNullableUnsignedInteger(payload.statusPotencyAfter, "statusPotencyAfter");
      if ((payload.resource === null) !== (payload.resourceAfter === null)) throw new TypeError("combat resource and resulting value must appear together");
      const hasStatus = payload.statusId !== null;
      if (hasStatus !== (payload.statusDurationAfter !== null && payload.statusPotencyAfter !== null)) throw new TypeError("combat status fields must appear together");
      if (payload.kind.startsWith("status-") !== hasStatus) throw new TypeError("status effects require status details and other effects forbid them");
      if ((payload.kind === "damage" || payload.kind === "healing") && payload.resource !== "health") throw new TypeError(`${payload.kind} must resolve health`);
      if (payload.kind === "mana-spent" && payload.resource !== "mana") throw new TypeError("mana-spent must resolve mana");
      if (payload.kind === "guarded" && payload.resource !== "guard") throw new TypeError("guarded must resolve guard");
      if ((payload.kind === "status-applied" || payload.kind === "status-expired") && payload.resource !== null) throw new TypeError(`${payload.kind} cannot also resolve a resource`);
      if (payload.kind === "defeated" && (payload.resource !== "health" || payload.resourceAfter !== 0)) throw new TypeError("defeated must leave health at zero");
      return;
    }
    case "combat.ended":
      assertExactKeys(payload, ["combatId", "outcome", "turns"], event.type);
      assertString(payload.combatId, "combatId");
      assertEnum(payload.outcome, combatOutcomeCodes, "combat outcome");
      assertPositiveInteger(payload.turns, "combat turns");
      return;
    case "monster.observed":
      assertExactKeys(payload, ["speciesId", "encountersAfter"], event.type);
      assertString(payload.speciesId, "speciesId");
      assertPositiveInteger(payload.encountersAfter, "encountersAfter");
      return;
    case "monster.insight-gained":
      assertExactKeys(payload, ["speciesId", "insightDelta", "insightAfter", "requiredInsight", "victoriesAfter"], event.type);
      assertString(payload.speciesId, "speciesId");
      assertPositiveInteger(payload.insightDelta, "insightDelta");
      assertUnsignedInteger(payload.insightAfter, "insightAfter");
      if (payload.insightAfter < payload.insightDelta) throw new RangeError("insightAfter cannot be smaller than its delta");
      assertPositiveInteger(payload.requiredInsight, "requiredInsight");
      assertUnsignedInteger(payload.victoriesAfter, "victoriesAfter");
      return;
    case "ability.progressed":
      assertExactKeys(payload, ["abilityId", "source", "experienceDelta", "experienceAfter", "levelAfter", "usesDelta", "usesAfter"], event.type);
      assertString(payload.abilityId, "abilityId");
      assertEnum(payload.source, abilityProgressSourceCodes, "ability progress source");
      assertPositiveInteger(payload.experienceDelta, "experienceDelta");
      assertUnsignedInteger(payload.experienceAfter, "experienceAfter");
      if (payload.experienceAfter < payload.experienceDelta) throw new RangeError("experienceAfter cannot be smaller than its delta");
      assertPositiveInteger(payload.levelAfter, "levelAfter");
      assertUnsignedInteger(payload.usesDelta, "usesDelta");
      assertUnsignedInteger(payload.usesAfter, "usesAfter");
      if (payload.usesAfter < payload.usesDelta) throw new RangeError("usesAfter cannot be smaller than its delta");
      return;
    case "ability.learned":
      assertExactKeys(payload, ["abilityId", "speciesId"], event.type);
      assertString(payload.abilityId, "abilityId");
      assertString(payload.speciesId, "speciesId");
      return;
    case "quest.progressed":
      assertExactKeys(payload, ["objectiveId", "appliedDelta", "currentAfter", "objectiveCompleted"], event.type);
      assertString(payload.objectiveId, "objectiveId");
      assertPositiveInteger(payload.appliedDelta, "appliedDelta");
      assertUnsignedInteger(payload.currentAfter, "currentAfter");
      if (payload.currentAfter < payload.appliedDelta) throw new RangeError("currentAfter cannot be smaller than its delta");
      assertBoolean(payload.objectiveCompleted, "objectiveCompleted");
      return;
    case "quest.fulfilled":
      assertExactKeys(payload, ["completionId", "questInstanceId", "questId", "questOrdinal", "objectiveCount", "subquestCount", "totalCompletedQuests"], event.type);
      assertString(payload.completionId, "completionId");
      assertString(payload.questInstanceId, "questInstanceId");
      assertString(payload.questId, "questId");
      assertUnsignedInteger(payload.questOrdinal, "questOrdinal");
      assertPositiveInteger(payload.objectiveCount, "objectiveCount");
      assertUnsignedInteger(payload.subquestCount, "subquestCount");
      assertPositiveInteger(payload.totalCompletedQuests, "totalCompletedQuests");
      if (payload.questInstanceId !== `${payload.questId}:instance:${payload.questOrdinal}`) throw new TypeError("quest fulfillment instance identity is invalid");
      if (payload.completionId !== `${payload.questInstanceId}:fulfilled`) throw new TypeError("quest fulfillment completion identity is invalid");
      if (payload.totalCompletedQuests !== payload.questOrdinal + 1) throw new RangeError("quest fulfillment total must follow its ordinal");
      return;
    case "quest.reward-applied":
      assertExactKeys(payload, ["grantId", "completionId", "experienceDelta", "experienceAfter", "levelBefore", "levelAfter", "goldDelta", "goldAfter", "itemId", "itemDisposition", "itemConversionGold"], event.type);
      for (const key of ["grantId", "completionId", "itemId"] as const) assertString(payload[key], key);
      if (payload.grantId !== `${payload.completionId}:reward:0`) throw new TypeError("quest reward grant identity is invalid");
      for (const key of ["experienceDelta", "experienceAfter", "goldDelta", "goldAfter", "itemConversionGold"] as const) assertUnsignedInteger(payload[key], key);
      assertPositiveInteger(payload.levelBefore, "levelBefore");
      assertPositiveInteger(payload.levelAfter, "levelAfter");
      if (payload.levelAfter < payload.levelBefore) throw new RangeError("reward level cannot decrease");
      if ((payload.experienceAfter as number) < (payload.experienceDelta as number) || (payload.goldAfter as number) < (payload.goldDelta as number)) throw new RangeError("reward totals cannot be smaller than their deltas");
      if (payload.itemDisposition !== "inventory" && payload.itemDisposition !== "converted-to-gold") throw new TypeError("itemDisposition is invalid");
      if (payload.itemDisposition === "inventory" && payload.itemConversionGold !== 0) throw new RangeError("inventory reward cannot credit conversion gold");
      return;
    case "quest.admitted":
      assertExactKeys(payload, ["questInstanceId", "questId", "questOrdinal", "predecessorCompletionId", "generatorVersion", "objectiveCount", "subquestCount"], event.type);
      for (const key of ["questInstanceId", "questId", "predecessorCompletionId", "generatorVersion"] as const) assertString(payload[key], key);
      assertPositiveInteger(payload.questOrdinal, "questOrdinal");
      assertPositiveInteger(payload.objectiveCount, "objectiveCount");
      assertUnsignedInteger(payload.subquestCount, "subquestCount");
      if (payload.generatorVersion !== "quest-sequence-v1") throw new TypeError("quest admission generator version is invalid");
      if (payload.questInstanceId !== `${payload.questId}:instance:${payload.questOrdinal}`) throw new TypeError("quest admission instance identity is invalid");
      if (!(payload.predecessorCompletionId as string).endsWith(`:instance:${payload.questOrdinal - 1}:fulfilled`)) throw new TypeError("quest admission predecessor identity is invalid");
      return;
    case "quest.lead-revealed":
      assertExactKeys(payload, ["leadId", "questInstanceId", "questOrdinal", "objectiveId", "locationId", "selectorVersion"], event.type);
      for (const key of ["leadId", "questInstanceId", "objectiveId", "locationId", "selectorVersion"] as const) assertString(payload[key], key);
      assertPositiveInteger(payload.questOrdinal, "questOrdinal");
      if (payload.objectiveId !== "quest:cross-maze") throw new TypeError("quest lead objective is invalid");
      if (payload.selectorVersion !== "quest-lead-v1") throw new TypeError("quest lead selector version is invalid");
      if (!(payload.questInstanceId as string).endsWith(`:instance:${payload.questOrdinal}`)) throw new TypeError("quest lead instance identity is invalid");
      if (payload.leadId !== `${payload.questInstanceId}:lead:${payload.objectiveId}`) throw new TypeError("quest lead identity is invalid");
      return;
    case "actor.recovered":
      assertExactKeys(payload, ["healthDelta", "healthAfter", "manaDelta", "manaAfter"], event.type);
      assertUnsignedInteger(payload.healthDelta, "healthDelta");
      assertUnsignedInteger(payload.healthAfter, "healthAfter");
      assertUnsignedInteger(payload.manaDelta, "manaDelta");
      assertUnsignedInteger(payload.manaAfter, "manaAfter");
      if (payload.healthDelta === 0 && payload.manaDelta === 0) throw new RangeError("recovery must change a resource");
      if (payload.healthAfter < payload.healthDelta || payload.manaAfter < payload.manaDelta) throw new RangeError("recovery totals cannot be smaller than their deltas");
      return;
    case "item.acquired":
      assertExactKeys(payload, ["itemId", "quantity"], event.type);
      assertString(payload.itemId, "itemId");
      assertPositiveInteger(payload.quantity, "item quantity");
      return;
    case "item.consumed":
      assertExactKeys(payload, ["combatId", "turn", "itemId", "effect", "quantityBefore", "quantityAfter", "disposition", "targetId", "maxHealth", "healthBefore", "healthDelta", "healthAfter"], event.type);
      for (const key of ["combatId", "itemId", "targetId"] as const) assertString(payload[key], key);
      assertPositiveInteger(payload.turn, "combat turn");
      assertPositiveInteger(payload.quantityBefore, "quantityBefore");
      assertUnsignedInteger(payload.quantityAfter, "quantityAfter");
      assertPositiveInteger(payload.maxHealth, "maxHealth");
      assertPositiveInteger(payload.healthBefore, "healthBefore");
      assertPositiveInteger(payload.healthDelta, "healthDelta");
      assertPositiveInteger(payload.healthAfter, "healthAfter");
      if (payload.effect !== "restore-health-quarter-max-v1") throw new TypeError("item effect is invalid");
      if (payload.disposition !== "retained" && payload.disposition !== "depleted") throw new TypeError("item disposition is invalid");
      if (payload.quantityAfter !== payload.quantityBefore - 1) throw new RangeError("item quantity must decrease by exactly one");
      if (payload.disposition !== (payload.quantityAfter === 0 ? "depleted" : "retained")) throw new RangeError("item disposition must match resulting quantity");
      if (payload.healthBefore >= payload.maxHealth || payload.healthAfter > payload.maxHealth) throw new RangeError("restorative health bounds are invalid");
      if (payload.healthDelta !== Math.min(payload.maxHealth - payload.healthBefore, Math.ceil(payload.maxHealth / 4))) throw new RangeError("restorative delta must match its frozen formula");
      if (payload.healthAfter !== payload.healthBefore + payload.healthDelta) throw new RangeError("restorative health arithmetic is invalid");
      return;
    case "equipment.changed":
      assertExactKeys(payload, ["slot", "previousItemId", "itemId"], event.type);
      assertString(payload.slot, "slot");
      assertNullableString(payload.previousItemId, "previousItemId");
      assertNullableString(payload.itemId, "itemId");
      if (payload.previousItemId === payload.itemId) throw new TypeError("equipment change must alter the slot");
      return;
    case "hero.progressed":
      assertExactKeys(payload, ["experienceDelta", "experienceAfter", "levelAfter"], event.type);
      assertPositiveInteger(payload.experienceDelta, "experienceDelta");
      assertUnsignedInteger(payload.experienceAfter, "experienceAfter");
      if (payload.experienceAfter < payload.experienceDelta) throw new RangeError("experienceAfter cannot be smaller than its delta");
      assertPositiveInteger(payload.levelAfter, "levelAfter");
      return;
    case "hero.growth-selected": {
      assertExactKeys(payload, ["recordId", "rulesVersion", "checkpointLevel", "crossedTick", "appliedLevel", "selectedPackageId", "packageSelectionAfter"], event.type);
      assertString(payload.recordId, "recordId");
      assertString(payload.rulesVersion, "rulesVersion");
      assertString(payload.selectedPackageId, "selectedPackageId");
      if (payload.rulesVersion !== "three-turning-points-v1") throw new TypeError("growth rules version is invalid");
      if (!payload.recordId.startsWith(`${event.campaignId}:growth:`) || payload.recordId.length === `${event.campaignId}:growth:`.length) throw new TypeError("growth record identity is invalid");
      if (payload.checkpointLevel !== 10 && payload.checkpointLevel !== 25 && payload.checkpointLevel !== 50) throw new RangeError("growth checkpoint is invalid");
      if (payload.selectedPackageId !== "growth-v1:field-temper" && payload.selectedPackageId !== "growth-v1:road-rhythm" && payload.selectedPackageId !== "growth-v1:inner-pattern") throw new TypeError("growth package is invalid");
      assertPositiveInteger(payload.crossedTick, "crossedTick");
      assertPositiveInteger(payload.appliedLevel, "appliedLevel");
      assertPositiveInteger(payload.packageSelectionAfter, "packageSelectionAfter");
      if (payload.crossedTick > event.worldTick) throw new RangeError("growth cannot be applied before it is crossed");
      if (payload.appliedLevel < payload.checkpointLevel || payload.appliedLevel > 1000) throw new RangeError("growth applied level is invalid");
      if (payload.packageSelectionAfter !== 1 && payload.packageSelectionAfter !== 2) throw new RangeError("growth package selection count is invalid");
      if (event.causeSequences.length === 0) throw new RangeError("growth requires a causal predecessor event");
      return;
    }
    case "equipment.mastery-earned":
      assertExactKeys(payload, ["receiptId", "rulesVersion", "weaponId", "combatId", "outcome", "basicStrikes", "damage", "experienceAfter", "levelBefore", "levelAfter"], event.type);
      for (const key of ["receiptId", "rulesVersion", "weaponId", "combatId"] as const) assertString(payload[key], key);
      if (payload.rulesVersion !== "weapon-effective-use-v1") throw new TypeError("equipment mastery rules version is invalid");
      if (payload.receiptId !== `${payload.combatId}:weapon-use:${payload.weaponId}`) throw new TypeError("equipment mastery receipt identity is invalid");
      assertEnum(payload.outcome, combatOutcomeCodes, "combat outcome");
      assertPositiveInteger(payload.basicStrikes, "basicStrikes");
      assertPositiveInteger(payload.damage, "damage");
      assertPositiveInteger(payload.experienceAfter, "experienceAfter");
      assertPositiveInteger(payload.levelBefore, "levelBefore");
      assertPositiveInteger(payload.levelAfter, "levelAfter");
      if (payload.basicStrikes > 128 || payload.experienceAfter > 45 ||
        payload.levelBefore !== weaponUseLevelForLedgerExperience(payload.experienceAfter - 1) ||
        payload.levelAfter !== weaponUseLevelForLedgerExperience(payload.experienceAfter)) {
        throw new RangeError("equipment mastery arithmetic is invalid");
      }
      if (event.causeSequences.length === 0) throw new RangeError("equipment mastery requires a causal predecessor event");
      return;
    case "currency.changed":
      assertExactKeys(payload, ["currency", "delta", "amountAfter"], event.type);
      assertEnum(payload.currency, currencyCodes, "currency");
      assertSignedInteger(payload.delta, "currency delta");
      if (payload.delta === 0) throw new RangeError("currency delta must change the balance");
      assertUnsignedInteger(payload.amountAfter, "amountAfter");
      return;
  }
}

export function assertAdventureEvent(value: unknown): asserts value is AdventureEvent {
  assertExactKeys(value, ["schemaVersion", "campaignId", "sequence", "worldTick", "type", "actorId", "causeSequences", "payload"], "adventure event");
  if (value.schemaVersion !== adventureEventSchemaVersion) throw new RangeError("Adventure event schema version is unsupported");
  assertString(value.campaignId, "campaignId");
  assertPositiveInteger(value.sequence, "event sequence");
  assertUnsignedInteger(value.worldTick, "worldTick");
  assertEnum(value.type, eventTypeCodes, "event type");
  assertNullableString(value.actorId, "actorId");
  assertCauseSequences(value.causeSequences, value.sequence);
  assertPayload(value as unknown as AdventureEvent);
  assertActor(value as unknown as AdventureEvent);
}

function payloadStrings(event: AdventureEvent): readonly string[] {
  switch (event.type) {
    case "campaign.started": return [event.payload.rulesetVersion, event.payload.generatorVersion, event.payload.worldSchemaVersion, event.payload.depthSchemaVersion, event.payload.initialStateHash, event.payload.heroId, event.payload.locationId];
    case "command.applied": return [];
    case "route.planned": return [event.payload.originLocationId, event.payload.destinationId, event.payload.routeHash];
    case "travel.edge-advanced": return [event.payload.edgeId, ...(event.payload.reachedLocationId === null ? [] : [event.payload.reachedLocationId])];
    case "town.visited": return [event.payload.townId];
    case "dungeon.entered": return [event.payload.dungeonId, event.payload.layoutVersion, event.payload.layoutHash];
    case "dungeon.moved": return [event.payload.dungeonId, event.payload.fromCellId, event.payload.toCellId, ...(event.payload.feature === null ? [] : [event.payload.feature])];
    case "dungeon.trap-triggered": return [event.payload.dungeonId, event.payload.cellId];
    case "combat.started": return [event.payload.combatId, ...event.payload.enemySpeciesIds];
    case "combat.action": return [event.payload.combatId, ...(event.payload.targetId === null ? [] : [event.payload.targetId]), ...(event.payload.abilityId === null ? [] : [event.payload.abilityId])];
    case "combat.effect": return [event.payload.combatId, event.payload.targetId, ...(event.payload.statusId === null ? [] : [event.payload.statusId])];
    case "combat.ended": return [event.payload.combatId];
    case "monster.observed": return [event.payload.speciesId];
    case "monster.insight-gained": return [event.payload.speciesId];
    case "ability.progressed": return [event.payload.abilityId];
    case "ability.learned": return [event.payload.abilityId, event.payload.speciesId];
    case "quest.progressed": return [event.payload.objectiveId];
    case "quest.fulfilled": return [event.payload.completionId, event.payload.questInstanceId, event.payload.questId];
    case "quest.reward-applied": return [event.payload.grantId, event.payload.completionId, event.payload.itemId];
    case "quest.admitted": return [event.payload.questInstanceId, event.payload.questId, event.payload.predecessorCompletionId, event.payload.generatorVersion];
    case "quest.lead-revealed": return [event.payload.leadId, event.payload.questInstanceId, event.payload.objectiveId, event.payload.locationId, event.payload.selectorVersion];
    case "actor.recovered": return [];
    case "item.acquired": return [event.payload.itemId];
    case "item.consumed": return [event.payload.combatId, event.payload.itemId, event.payload.effect, event.payload.targetId];
    case "equipment.changed": return [event.payload.slot, ...(event.payload.previousItemId === null ? [] : [event.payload.previousItemId]), ...(event.payload.itemId === null ? [] : [event.payload.itemId])];
    case "hero.progressed": return [];
    case "hero.growth-selected": return [event.payload.recordId, event.payload.rulesVersion, event.payload.selectedPackageId];
    case "equipment.mastery-earned": return [event.payload.receiptId, event.payload.rulesVersion, event.payload.weaponId, event.payload.combatId];
    case "currency.changed": return [];
  }
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function prepareEvents(events: readonly AdventureEvent[]): { dictionary: readonly string[]; dictionaryIndexes: ReadonlyMap<string, number> } {
  if (events.length === 0 || events.length > maximumAdventureEventsPerSegment) throw new RangeError("Adventure segment event count is outside bounds");
  const campaignId = events[0]?.campaignId;
  let previousSequence = 0;
  let previousTick = 0;
  const strings = new Map<string, Uint8Array>();
  const addString = (value: string): void => {
    if (strings.has(value)) return;
    if (strings.size === maximumAdventureDictionaryEntries) throw new RangeError("Adventure dictionary count is outside bounds");
    strings.set(value, encoder.encode(value));
  };
  for (const event of events) {
    assertAdventureEvent(event);
    if (event.campaignId !== campaignId) throw new TypeError("Adventure segment cannot mix campaigns");
    if (event.sequence <= previousSequence) throw new RangeError("Adventure event sequences must increase strictly");
    if (event.worldTick < previousTick) throw new RangeError("Adventure event ticks cannot move backward");
    previousSequence = event.sequence;
    previousTick = event.worldTick;
    addString(event.campaignId);
    if (event.actorId !== null) addString(event.actorId);
    for (const value of payloadStrings(event)) addString(value);
  }
  const dictionary = [...strings.keys()].sort((left, right) => compareBytes(strings.get(left)!, strings.get(right)!));
  return { dictionary, dictionaryIndexes: new Map(dictionary.map((value, index) => [value, index])) };
}

function dictionaryIndex(indexes: ReadonlyMap<string, number>, value: string): number {
  const index = indexes.get(value);
  if (index === undefined) throw new RangeError("Adventure string is absent from the dictionary");
  return index + 1;
}

function writeStringReference(writer: ByteWriter, indexes: ReadonlyMap<string, number>, value: string | null): void {
  writer.writeVarint(value === null ? 0 : dictionaryIndex(indexes, value));
}

function writeEnum<TValue extends string>(writer: ByteWriter, value: TValue, codes: Readonly<Record<TValue, number>>): void {
  writer.writeVarint(codes[value]);
}

function writeBoolean(writer: ByteWriter, value: boolean): void {
  writer.writeByte(value ? 1 : 0);
}

function writeNullableUnsigned(writer: ByteWriter, value: number | null): void {
  writer.writeVarint(value === null ? 0 : value + 1);
}

function writeSigned(writer: ByteWriter, value: number): void {
  writer.writeVarint(value >= 0 ? value * 2 : -value * 2 - 1);
}

function encodePayload(writer: ByteWriter, event: AdventureEvent, indexes: ReadonlyMap<string, number>): void {
  switch (event.type) {
    case "campaign.started":
      writer.writeVarint(event.payload.seed);
      for (const value of [event.payload.rulesetVersion, event.payload.generatorVersion, event.payload.worldSchemaVersion, event.payload.depthSchemaVersion, event.payload.initialStateHash, event.payload.heroId, event.payload.locationId]) writeStringReference(writer, indexes, value);
      return;
    case "command.applied": writeEnum(writer, event.payload.commandType, commandTypeCodes); return;
    case "route.planned":
      writeStringReference(writer, indexes, event.payload.originLocationId); writeStringReference(writer, indexes, event.payload.destinationId); writer.writeVarint(event.payload.legs); writer.writeVarint(event.payload.distance); writeStringReference(writer, indexes, event.payload.routeHash); return;
    case "travel.edge-advanced":
      writeStringReference(writer, indexes, event.payload.edgeId); writer.writeVarint(event.payload.progressBefore); writer.writeVarint(event.payload.progressAfter); writeStringReference(writer, indexes, event.payload.reachedLocationId); writeBoolean(writer, event.payload.routeCompleted); return;
    case "town.visited": writeStringReference(writer, indexes, event.payload.townId); writer.writeVarint(event.payload.visit); writer.writeVarint(event.payload.reputationAfter); return;
    case "dungeon.entered":
      writeStringReference(writer, indexes, event.payload.dungeonId); writer.writeVarint(event.payload.width); writer.writeVarint(event.payload.height); writeStringReference(writer, indexes, event.payload.layoutVersion); writeStringReference(writer, indexes, event.payload.layoutHash); return;
    case "dungeon.moved":
      writeStringReference(writer, indexes, event.payload.dungeonId); writeStringReference(writer, indexes, event.payload.fromCellId); writeStringReference(writer, indexes, event.payload.toCellId); writeEnum(writer, event.payload.direction, directionCodes); writeBoolean(writer, event.payload.firstVisit); writeStringReference(writer, indexes, event.payload.feature); writeBoolean(writer, event.payload.completed); return;
    case "dungeon.trap-triggered":
      writeStringReference(writer, indexes, event.payload.dungeonId); writeStringReference(writer, indexes, event.payload.cellId); writer.writeVarint(event.payload.damage); writer.writeVarint(event.payload.healthBefore); writer.writeVarint(event.payload.healthAfter); return;
    case "combat.started":
      writeStringReference(writer, indexes, event.payload.combatId); writer.writeVarint(event.payload.enemySpeciesIds.length); for (const speciesId of event.payload.enemySpeciesIds) writeStringReference(writer, indexes, speciesId); return;
    case "combat.action":
      writeStringReference(writer, indexes, event.payload.combatId); writer.writeVarint(event.payload.round); writer.writeVarint(event.payload.turn); writeEnum(writer, event.payload.action, combatActionCodes); writeStringReference(writer, indexes, event.payload.targetId); writeStringReference(writer, indexes, event.payload.abilityId); writer.writeVarint(event.payload.manaCost); return;
    case "combat.effect":
      writeStringReference(writer, indexes, event.payload.combatId); writeEnum(writer, event.payload.kind, combatEffectCodes); writeStringReference(writer, indexes, event.payload.targetId); writer.writeVarint(event.payload.resource === null ? 0 : resourceCodes[event.payload.resource]); writer.writeVarint(event.payload.amount); writeNullableUnsigned(writer, event.payload.resourceAfter); writeStringReference(writer, indexes, event.payload.statusId); writeNullableUnsigned(writer, event.payload.statusDurationAfter); writeNullableUnsigned(writer, event.payload.statusPotencyAfter); return;
    case "combat.ended": writeStringReference(writer, indexes, event.payload.combatId); writeEnum(writer, event.payload.outcome, combatOutcomeCodes); writer.writeVarint(event.payload.turns); return;
    case "monster.observed": writeStringReference(writer, indexes, event.payload.speciesId); writer.writeVarint(event.payload.encountersAfter); return;
    case "monster.insight-gained": writeStringReference(writer, indexes, event.payload.speciesId); writer.writeVarint(event.payload.insightDelta); writer.writeVarint(event.payload.insightAfter); writer.writeVarint(event.payload.requiredInsight); writer.writeVarint(event.payload.victoriesAfter); return;
    case "ability.progressed":
      writeStringReference(writer, indexes, event.payload.abilityId); writeEnum(writer, event.payload.source, abilityProgressSourceCodes); writer.writeVarint(event.payload.experienceDelta); writer.writeVarint(event.payload.experienceAfter); writer.writeVarint(event.payload.levelAfter); writer.writeVarint(event.payload.usesDelta); writer.writeVarint(event.payload.usesAfter); return;
    case "ability.learned": writeStringReference(writer, indexes, event.payload.abilityId); writeStringReference(writer, indexes, event.payload.speciesId); return;
    case "quest.progressed": writeStringReference(writer, indexes, event.payload.objectiveId); writer.writeVarint(event.payload.appliedDelta); writer.writeVarint(event.payload.currentAfter); writeBoolean(writer, event.payload.objectiveCompleted); return;
    case "quest.fulfilled": writeStringReference(writer, indexes, event.payload.completionId); writeStringReference(writer, indexes, event.payload.questInstanceId); writeStringReference(writer, indexes, event.payload.questId); writer.writeVarint(event.payload.questOrdinal); writer.writeVarint(event.payload.objectiveCount); writer.writeVarint(event.payload.subquestCount); writer.writeVarint(event.payload.totalCompletedQuests); return;
    case "quest.reward-applied": writeStringReference(writer, indexes, event.payload.grantId); writeStringReference(writer, indexes, event.payload.completionId); writer.writeVarint(event.payload.experienceDelta); writer.writeVarint(event.payload.experienceAfter); writer.writeVarint(event.payload.levelBefore); writer.writeVarint(event.payload.levelAfter); writer.writeVarint(event.payload.goldDelta); writer.writeVarint(event.payload.goldAfter); writeStringReference(writer, indexes, event.payload.itemId); writeBoolean(writer, event.payload.itemDisposition === "converted-to-gold"); writer.writeVarint(event.payload.itemConversionGold); return;
    case "quest.admitted": writeStringReference(writer, indexes, event.payload.questInstanceId); writeStringReference(writer, indexes, event.payload.questId); writer.writeVarint(event.payload.questOrdinal); writeStringReference(writer, indexes, event.payload.predecessorCompletionId); writeStringReference(writer, indexes, event.payload.generatorVersion); writer.writeVarint(event.payload.objectiveCount); writer.writeVarint(event.payload.subquestCount); return;
    case "quest.lead-revealed": writeStringReference(writer, indexes, event.payload.leadId); writeStringReference(writer, indexes, event.payload.questInstanceId); writer.writeVarint(event.payload.questOrdinal); writeStringReference(writer, indexes, event.payload.objectiveId); writeStringReference(writer, indexes, event.payload.locationId); writeStringReference(writer, indexes, event.payload.selectorVersion); return;
    case "actor.recovered": writer.writeVarint(event.payload.healthDelta); writer.writeVarint(event.payload.healthAfter); writer.writeVarint(event.payload.manaDelta); writer.writeVarint(event.payload.manaAfter); return;
    case "item.acquired": writeStringReference(writer, indexes, event.payload.itemId); writer.writeVarint(event.payload.quantity); return;
    case "item.consumed":
      writeStringReference(writer, indexes, event.payload.combatId); writer.writeVarint(event.payload.turn); writeStringReference(writer, indexes, event.payload.itemId); writeStringReference(writer, indexes, event.payload.effect); writer.writeVarint(event.payload.quantityBefore); writer.writeVarint(event.payload.quantityAfter); writeBoolean(writer, event.payload.disposition === "depleted"); writeStringReference(writer, indexes, event.payload.targetId); writer.writeVarint(event.payload.maxHealth); writer.writeVarint(event.payload.healthBefore); writer.writeVarint(event.payload.healthDelta); writer.writeVarint(event.payload.healthAfter); return;
    case "equipment.changed": writeStringReference(writer, indexes, event.payload.slot); writeStringReference(writer, indexes, event.payload.previousItemId); writeStringReference(writer, indexes, event.payload.itemId); return;
    case "hero.progressed": writer.writeVarint(event.payload.experienceDelta); writer.writeVarint(event.payload.experienceAfter); writer.writeVarint(event.payload.levelAfter); return;
    case "hero.growth-selected":
      writeStringReference(writer, indexes, event.payload.recordId); writeStringReference(writer, indexes, event.payload.rulesVersion); writer.writeVarint(event.payload.checkpointLevel); writer.writeVarint(event.payload.crossedTick); writer.writeVarint(event.payload.appliedLevel); writeStringReference(writer, indexes, event.payload.selectedPackageId); writer.writeVarint(event.payload.packageSelectionAfter); return;
    case "equipment.mastery-earned":
      writeStringReference(writer, indexes, event.payload.receiptId); writeStringReference(writer, indexes, event.payload.rulesVersion); writeStringReference(writer, indexes, event.payload.weaponId); writeStringReference(writer, indexes, event.payload.combatId); writeEnum(writer, event.payload.outcome, combatOutcomeCodes); writer.writeVarint(event.payload.basicStrikes); writer.writeVarint(event.payload.damage); writer.writeVarint(event.payload.experienceAfter); writer.writeVarint(event.payload.levelBefore); writer.writeVarint(event.payload.levelAfter); return;
    case "currency.changed": writeEnum(writer, event.payload.currency, currencyCodes); writeSigned(writer, event.payload.delta); writer.writeVarint(event.payload.amountAfter); return;
  }
}

function encodeRecord(event: AdventureEvent, indexes: ReadonlyMap<string, number>, previousSequence: number, previousTick: number): Uint8Array {
  const writer = new ByteWriter();
  writer.writeVarint(event.schemaVersion);
  writer.writeVarint(event.sequence - previousSequence);
  writer.writeVarint(event.worldTick - previousTick);
  writer.writeVarint(eventTypeCodes[event.type]);
  writeStringReference(writer, indexes, event.actorId);
  writer.writeVarint(event.causeSequences.length);
  for (const cause of event.causeSequences) writer.writeVarint(event.sequence - cause);
  encodePayload(writer, event, indexes);
  return writer.toUint8Array();
}

export function adventureChecksum(values: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const value of values) hash = Math.imul(hash ^ value, 0x01000193);
  return hash >>> 0;
}

function appendChecksum(body: Uint8Array): Uint8Array {
  if (body.byteLength > maximumBodyBytes) throw new RangeError("Adventure segment exceeds byte limit");
  const output = new Uint8Array(body.byteLength + checksumBytes);
  output.set(body);
  const checksum = adventureChecksum(body);
  const offset = body.byteLength;
  output[offset] = checksum & 0xff;
  output[offset + 1] = (checksum >>> 8) & 0xff;
  output[offset + 2] = (checksum >>> 16) & 0xff;
  output[offset + 3] = (checksum >>> 24) & 0xff;
  return output;
}

function storedChecksum(values: Uint8Array): number {
  const offset = values.byteLength - checksumBytes;
  return ((values[offset] ?? 0) | ((values[offset + 1] ?? 0) << 8) | ((values[offset + 2] ?? 0) << 16) | ((values[offset + 3] ?? 0) << 24)) >>> 0;
}

function encodeBody(events: readonly AdventureEvent[]): { body: Uint8Array; recordLengths: readonly number[] } {
  const { dictionary, dictionaryIndexes } = prepareEvents(events);
  const writer = new ByteWriter(maximumBodyBytes);
  writer.writeBytes(segmentMagic);
  writer.writeVarint(segmentCodecVersion);
  writer.writeVarint(events.length);
  writer.writeVarint(dictionary.length);
  for (const value of dictionary) {
    const bytes = encoder.encode(value);
    writer.writeVarint(bytes.byteLength);
    writer.writeBytes(bytes);
  }
  const campaignId = events[0]?.campaignId;
  if (campaignId === undefined) throw new RangeError("Adventure segment has no campaign");
  writer.writeVarint(dictionaryIndex(dictionaryIndexes, campaignId));
  let previousSequence = 0;
  let previousTick = 0;
  const recordLengths: number[] = [];
  for (const event of events) {
    const record = encodeRecord(event, dictionaryIndexes, previousSequence, previousTick);
    recordLengths.push(record.byteLength);
    writer.writeVarint(record.byteLength);
    writer.writeBytes(record);
    previousSequence = event.sequence;
    previousTick = event.worldTick;
  }
  return { body: writer.toUint8Array(), recordLengths };
}

export function encodeAdventureSegment(events: readonly AdventureEvent[]): Uint8Array {
  return appendChecksum(encodeBody(events).body);
}

export function adventureEventRecordByteLengths(events: readonly AdventureEvent[]): readonly number[] {
  return encodeBody(events).recordLengths;
}

function readDictionaryReference(reader: ByteReader, dictionary: readonly string[], nullable: boolean): string | null {
  const encodedIndex = reader.readVarint();
  if (encodedIndex === 0) {
    if (!nullable) throw new RangeError("Adventure dictionary reference cannot be null");
    return null;
  }
  const value = dictionary[encodedIndex - 1];
  if (value === undefined) throw new RangeError("Adventure dictionary reference is broken");
  return value;
}

function readRequiredReference(reader: ByteReader, dictionary: readonly string[]): string {
  const value = readDictionaryReference(reader, dictionary, false);
  if (value === null) throw new RangeError("Adventure dictionary reference cannot be null");
  return value;
}

function readEnum<TValue extends string>(reader: ByteReader, values: ReadonlyMap<number, TValue>, label: string): TValue {
  const value = values.get(reader.readVarint());
  if (value === undefined) throw new RangeError(`${label} code is unknown`);
  return value;
}

function readNullableEnum<TValue extends string>(reader: ByteReader, values: ReadonlyMap<number, TValue>, label: string): TValue | null {
  const code = reader.readVarint();
  if (code === 0) return null;
  const value = values.get(code);
  if (value === undefined) throw new RangeError(`${label} code is unknown`);
  return value;
}

function readBoolean(reader: ByteReader, label: string): boolean {
  const value = reader.readByte();
  if (value !== 0 && value !== 1) throw new RangeError(`${label} boolean is invalid`);
  return value === 1;
}

function readNullableUnsigned(reader: ByteReader): number | null {
  const value = reader.readVarint();
  return value === 0 ? null : value - 1;
}

function readSigned(reader: ByteReader): number {
  const value = reader.readVarint();
  return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
}

function decodePayload(reader: ByteReader, type: AdventureEventType, dictionary: readonly string[]): AdventureEventPayloads[AdventureEventType] {
  switch (type) {
    case "campaign.started": return { seed: reader.readVarint(), rulesetVersion: readRequiredReference(reader, dictionary), generatorVersion: readRequiredReference(reader, dictionary), worldSchemaVersion: readRequiredReference(reader, dictionary), depthSchemaVersion: readRequiredReference(reader, dictionary), initialStateHash: readRequiredReference(reader, dictionary), heroId: readRequiredReference(reader, dictionary), locationId: readRequiredReference(reader, dictionary) };
    case "command.applied": return { commandType: readEnum(reader, commandTypesByCode, "command type") };
    case "route.planned": return { originLocationId: readRequiredReference(reader, dictionary), destinationId: readRequiredReference(reader, dictionary), legs: reader.readVarint(), distance: reader.readVarint(), routeHash: readRequiredReference(reader, dictionary) };
    case "travel.edge-advanced": return { edgeId: readRequiredReference(reader, dictionary), progressBefore: reader.readVarint(), progressAfter: reader.readVarint(), reachedLocationId: readDictionaryReference(reader, dictionary, true), routeCompleted: readBoolean(reader, "routeCompleted") };
    case "town.visited": return { townId: readRequiredReference(reader, dictionary), visit: reader.readVarint(), reputationAfter: reader.readVarint() };
    case "dungeon.entered": return { dungeonId: readRequiredReference(reader, dictionary), width: reader.readVarint(), height: reader.readVarint(), layoutVersion: readRequiredReference(reader, dictionary), layoutHash: readRequiredReference(reader, dictionary) };
    case "dungeon.moved": return { dungeonId: readRequiredReference(reader, dictionary), fromCellId: readRequiredReference(reader, dictionary), toCellId: readRequiredReference(reader, dictionary), direction: readEnum(reader, directionsByCode, "dungeon direction"), firstVisit: readBoolean(reader, "firstVisit"), feature: readDictionaryReference(reader, dictionary, true), completed: readBoolean(reader, "completed") };
    case "dungeon.trap-triggered": return { dungeonId: readRequiredReference(reader, dictionary), cellId: readRequiredReference(reader, dictionary), damage: reader.readVarint(), healthBefore: reader.readVarint(), healthAfter: reader.readVarint() };
    case "combat.started": {
      const combatId = readRequiredReference(reader, dictionary);
      const enemyCount = reader.readVarint();
      if (enemyCount === 0 || enemyCount > maximumAdventureReferencesPerEvent) throw new RangeError("enemySpeciesIds count is outside bounds");
      return { combatId, enemySpeciesIds: Array.from({ length: enemyCount }, () => readRequiredReference(reader, dictionary)) };
    }
    case "combat.action": return { combatId: readRequiredReference(reader, dictionary), round: reader.readVarint(), turn: reader.readVarint(), action: readEnum(reader, combatActionsByCode, "combat action"), targetId: readDictionaryReference(reader, dictionary, true), abilityId: readDictionaryReference(reader, dictionary, true), manaCost: reader.readVarint() };
    case "combat.effect": return { combatId: readRequiredReference(reader, dictionary), kind: readEnum(reader, combatEffectsByCode, "combat effect"), targetId: readRequiredReference(reader, dictionary), resource: readNullableEnum(reader, resourcesByCode, "resource"), amount: reader.readVarint(), resourceAfter: readNullableUnsigned(reader), statusId: readDictionaryReference(reader, dictionary, true), statusDurationAfter: readNullableUnsigned(reader), statusPotencyAfter: readNullableUnsigned(reader) };
    case "combat.ended": return { combatId: readRequiredReference(reader, dictionary), outcome: readEnum(reader, combatOutcomesByCode, "combat outcome"), turns: reader.readVarint() };
    case "monster.observed": return { speciesId: readRequiredReference(reader, dictionary), encountersAfter: reader.readVarint() };
    case "monster.insight-gained": return { speciesId: readRequiredReference(reader, dictionary), insightDelta: reader.readVarint(), insightAfter: reader.readVarint(), requiredInsight: reader.readVarint(), victoriesAfter: reader.readVarint() };
    case "ability.progressed": return { abilityId: readRequiredReference(reader, dictionary), source: readEnum(reader, abilityProgressSourcesByCode, "ability progress source"), experienceDelta: reader.readVarint(), experienceAfter: reader.readVarint(), levelAfter: reader.readVarint(), usesDelta: reader.readVarint(), usesAfter: reader.readVarint() };
    case "ability.learned": return { abilityId: readRequiredReference(reader, dictionary), speciesId: readRequiredReference(reader, dictionary) };
    case "quest.progressed": return { objectiveId: readRequiredReference(reader, dictionary), appliedDelta: reader.readVarint(), currentAfter: reader.readVarint(), objectiveCompleted: readBoolean(reader, "objectiveCompleted") };
    case "quest.fulfilled": return { completionId: readRequiredReference(reader, dictionary), questInstanceId: readRequiredReference(reader, dictionary), questId: readRequiredReference(reader, dictionary), questOrdinal: reader.readVarint(), objectiveCount: reader.readVarint(), subquestCount: reader.readVarint(), totalCompletedQuests: reader.readVarint() };
    case "quest.reward-applied": return { grantId: readRequiredReference(reader, dictionary), completionId: readRequiredReference(reader, dictionary), experienceDelta: reader.readVarint(), experienceAfter: reader.readVarint(), levelBefore: reader.readVarint(), levelAfter: reader.readVarint(), goldDelta: reader.readVarint(), goldAfter: reader.readVarint(), itemId: readRequiredReference(reader, dictionary), itemDisposition: readBoolean(reader, "itemDisposition") ? "converted-to-gold" : "inventory", itemConversionGold: reader.readVarint() };
    case "quest.admitted": return { questInstanceId: readRequiredReference(reader, dictionary), questId: readRequiredReference(reader, dictionary), questOrdinal: reader.readVarint(), predecessorCompletionId: readRequiredReference(reader, dictionary), generatorVersion: readRequiredReference(reader, dictionary) as "quest-sequence-v1", objectiveCount: reader.readVarint(), subquestCount: reader.readVarint() };
    case "quest.lead-revealed": return { leadId: readRequiredReference(reader, dictionary), questInstanceId: readRequiredReference(reader, dictionary), questOrdinal: reader.readVarint(), objectiveId: readRequiredReference(reader, dictionary) as "quest:cross-maze", locationId: readRequiredReference(reader, dictionary), selectorVersion: readRequiredReference(reader, dictionary) as "quest-lead-v1" };
    case "actor.recovered": return { healthDelta: reader.readVarint(), healthAfter: reader.readVarint(), manaDelta: reader.readVarint(), manaAfter: reader.readVarint() };
    case "item.acquired": return { itemId: readRequiredReference(reader, dictionary), quantity: reader.readVarint() };
    case "item.consumed": return { combatId: readRequiredReference(reader, dictionary), turn: reader.readVarint(), itemId: readRequiredReference(reader, dictionary), effect: readRequiredReference(reader, dictionary) as "restore-health-quarter-max-v1", quantityBefore: reader.readVarint(), quantityAfter: reader.readVarint(), disposition: readBoolean(reader, "item disposition") ? "depleted" : "retained", targetId: readRequiredReference(reader, dictionary), maxHealth: reader.readVarint(), healthBefore: reader.readVarint(), healthDelta: reader.readVarint(), healthAfter: reader.readVarint() };
    case "equipment.changed": return { slot: readRequiredReference(reader, dictionary), previousItemId: readDictionaryReference(reader, dictionary, true), itemId: readDictionaryReference(reader, dictionary, true) };
    case "hero.progressed": return { experienceDelta: reader.readVarint(), experienceAfter: reader.readVarint(), levelAfter: reader.readVarint() };
    case "hero.growth-selected": return { recordId: readRequiredReference(reader, dictionary), rulesVersion: readRequiredReference(reader, dictionary) as "three-turning-points-v1", checkpointLevel: reader.readVarint() as 10 | 25 | 50, crossedTick: reader.readVarint(), appliedLevel: reader.readVarint(), selectedPackageId: readRequiredReference(reader, dictionary) as "growth-v1:field-temper" | "growth-v1:road-rhythm" | "growth-v1:inner-pattern", packageSelectionAfter: reader.readVarint() as 1 | 2 };
    case "equipment.mastery-earned": return { receiptId: readRequiredReference(reader, dictionary), rulesVersion: readRequiredReference(reader, dictionary) as "weapon-effective-use-v1", weaponId: readRequiredReference(reader, dictionary), combatId: readRequiredReference(reader, dictionary), outcome: readEnum(reader, combatOutcomesByCode, "combat outcome"), basicStrikes: reader.readVarint(), damage: reader.readVarint(), experienceAfter: reader.readVarint(), levelBefore: reader.readVarint(), levelAfter: reader.readVarint() };
    case "currency.changed": return { currency: readEnum(reader, currenciesByCode, "currency"), delta: readSigned(reader), amountAfter: reader.readVarint() };
  }
}

export function decodeAdventureSegment(values: Uint8Array): readonly AdventureEvent[] {
  if (!(values instanceof Uint8Array)) throw new TypeError("Adventure segment must be bytes");
  if (values.byteLength <= segmentMagic.length + checksumBytes || values.byteLength > maximumAdventureSegmentBytes) throw new RangeError("Adventure segment byte length is outside bounds");
  const body = values.subarray(0, values.byteLength - checksumBytes);
  if (storedChecksum(values) !== adventureChecksum(body)) throw new RangeError("Adventure segment checksum does not match");
  const reader = new ByteReader(body);
  for (const expected of segmentMagic) if (reader.readByte() !== expected) throw new RangeError("Adventure segment magic is invalid");
  if (reader.readVarint() !== segmentCodecVersion) throw new RangeError("Adventure segment codec version is unsupported");
  const eventCount = reader.readVarint();
  if (eventCount === 0 || eventCount > maximumAdventureEventsPerSegment) throw new RangeError("Adventure segment event count is outside bounds");
  const dictionaryCount = reader.readVarint();
  if (dictionaryCount === 0 || dictionaryCount > maximumAdventureDictionaryEntries) throw new RangeError("Adventure dictionary count is outside bounds");
  const dictionary: string[] = [];
  let previousDictionaryBytes: Uint8Array | undefined;
  for (let index = 0; index < dictionaryCount; index += 1) {
    const byteLength = reader.readVarint();
    if (byteLength === 0 || byteLength > maximumAdventureStringBytes) throw new RangeError("Adventure dictionary string length is outside bounds");
    const bytes = reader.readBytes(byteLength);
    let value: string;
    try { value = decoder.decode(bytes); } catch { throw new TypeError("Adventure dictionary string is invalid UTF-8"); }
    if (previousDictionaryBytes !== undefined && compareBytes(previousDictionaryBytes, bytes) >= 0) throw new TypeError("Adventure dictionary order is not canonical or contains duplicates");
    dictionary.push(value);
    previousDictionaryBytes = bytes;
  }
  const campaignId = readRequiredReference(reader, dictionary);
  const events: AdventureEvent[] = [];
  let previousSequence = 0;
  let previousTick = 0;
  for (let index = 0; index < eventCount; index += 1) {
    const recordLength = reader.readVarint();
    if (recordLength === 0) throw new RangeError("Adventure event record cannot be empty");
    const record = new ByteReader(reader.readBytes(recordLength));
    const schemaVersion = record.readVarint();
    if (schemaVersion !== adventureEventSchemaVersion) throw new RangeError("Adventure event schema version is unsupported");
    const sequenceDelta = record.readVarint();
    if (sequenceDelta === 0) throw new RangeError("Adventure event sequence delta must be positive");
    const sequence = previousSequence + sequenceDelta;
    const worldTick = previousTick + record.readVarint();
    if (!Number.isSafeInteger(sequence) || !Number.isSafeInteger(worldTick)) throw new RangeError("Adventure event counter exceeds safe integer range");
    const type = readEnum(record, eventTypesByCode, "adventure event type");
    const actorId = readDictionaryReference(record, dictionary, true);
    const causeCount = record.readVarint();
    if (causeCount > maximumAdventureReferencesPerEvent) throw new RangeError("causeSequences exceeds the reference limit");
    const causeSequences = Array.from({ length: causeCount }, () => {
      const backwardDelta = record.readVarint();
      if (backwardDelta === 0 || backwardDelta >= sequence) throw new RangeError("cause sequence must precede its event");
      return sequence - backwardDelta;
    });
    const event = { schemaVersion, campaignId, sequence, worldTick, type, actorId, causeSequences, payload: decodePayload(record, type, dictionary) } as AdventureEvent;
    record.expectEnd("Adventure event record");
    assertAdventureEvent(event);
    events.push(event);
    previousSequence = sequence;
    previousTick = worldTick;
  }
  reader.expectEnd("Adventure segment");
  const canonicalDictionary = prepareEvents(events).dictionary;
  if (canonicalDictionary.length !== dictionary.length || canonicalDictionary.some((value, index) => value !== dictionary[index])) {
    throw new TypeError("Adventure dictionary contains unused or noncanonical entries");
  }
  return events;
}
