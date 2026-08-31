import { describe, expect, it } from "vitest";
import {
  adventureChecksum,
  adventureCodecCodeManifest,
  adventureEventRecordByteLengths,
  assertAdventureEvent,
  decodeAdventureSegment,
  encodeAdventureSegment,
} from "./codec";
import {
  adventureEventSchemaVersion,
  maximumAdventureDictionaryEntries,
  maximumAdventureReferencesPerEvent,
  maximumAdventureStringBytes,
  type AdventureEvent,
  type AdventureEventPayloads,
  type AdventureEventType,
} from "./types";

function event<TType extends AdventureEventType>(
  sequence: number,
  worldTick: number,
  type: TType,
  payload: AdventureEventPayloads[TType],
  actorId: string | null = "hero:aster",
  causeSequences: readonly number[] = sequence === 1 ? [] : [sequence - 1],
): AdventureEvent {
  return {
    schemaVersion: adventureEventSchemaVersion,
    campaignId: "campaign:ledger",
    sequence,
    worldTick,
    type,
    actorId,
    causeSequences,
    payload,
  } as unknown as AdventureEvent;
}

const fixtures: readonly AdventureEvent[] = [
  event(1, 0, "campaign.started", {
    seed: 4_294_967_295,
    rulesetVersion: "rules:v1",
    generatorVersion: "generator:v1",
    worldSchemaVersion: "world:v2",
    depthSchemaVersion: "depth:v1",
    initialStateHash: "sha256:genesis",
    heroId: "hero:aster",
    locationId: "location:0",
  }),
  event(2, 1, "command.applied", { commandType: "plan-route" }),
  event(3, 1, "route.planned", { originLocationId: "location:0", destinationId: "location:2", legs: 2, distance: 31, routeHash: "route:0-1-2" }),
  event(4, 2, "travel.edge-advanced", { edgeId: "location:0~location:1", progressBefore: 0, progressAfter: 9, reachedLocationId: null, routeCompleted: false }),
  event(5, 3, "town.visited", { townId: "town:foxbridge", visit: 2, reputationAfter: 7 }),
  event(6, 4, "dungeon.entered", { dungeonId: "dungeon:glass", width: 7, height: 7, layoutVersion: "maze:v1", layoutHash: "layout:glass" }),
  event(7, 5, "dungeon.moved", { dungeonId: "dungeon:glass", fromCellId: "cell:0:0", toCellId: "cell:1:0", direction: "east", firstVisit: true, feature: "chest", completed: false }),
  event(8, 6, "combat.started", { combatId: "combat:road", enemySpeciesIds: ["species:lantern-wolf", "species:moss-slime"] }),
  event(9, 6, "combat.action", { combatId: "combat:road", round: 1, turn: 1, action: "ability", targetId: "monster:wolf", abilityId: "ability:thorn", manaCost: 3 }),
  event(10, 6, "combat.effect", { combatId: "combat:road", kind: "damage", targetId: "monster:wolf", resource: "health", amount: 8, resourceAfter: 4, statusId: null, statusDurationAfter: null, statusPotencyAfter: null }),
  event(11, 6, "combat.effect", { combatId: "combat:road", kind: "status-applied", targetId: "monster:wolf", resource: null, amount: 0, resourceAfter: null, statusId: "status:rooted", statusDurationAfter: 2, statusPotencyAfter: 1 }),
  event(12, 7, "combat.ended", { combatId: "combat:road", outcome: "victory", turns: 5 }),
  event(13, 7, "monster.observed", { speciesId: "species:lantern-wolf", encountersAfter: 3 }),
  event(14, 7, "monster.insight-gained", { speciesId: "species:lantern-wolf", insightDelta: 2, insightAfter: 7, requiredInsight: 12, victoriesAfter: 2 }),
  event(15, 8, "ability.progressed", { abilityId: "ability:thorn", source: "combat", experienceDelta: 3, experienceAfter: 19, levelAfter: 2, usesDelta: 1, usesAfter: 8 }),
  event(16, 9, "ability.learned", { abilityId: "ability:moonhowl", speciesId: "species:lantern-wolf" }),
  event(17, 10, "quest.progressed", { objectiveId: "objective:courier", appliedDelta: 1, currentAfter: 4, objectiveCompleted: true }),
  event(18, 11, "actor.recovered", { healthDelta: 9, healthAfter: 38, manaDelta: 4, manaAfter: 12 }),
  event(19, 12, "item.acquired", { itemId: "item:roadworn-blade", quantity: 1 }),
  event(20, 12, "equipment.changed", { slot: "weapon", previousItemId: "item:stick", itemId: "item:roadworn-blade" }),
  event(21, 12, "hero.progressed", { experienceDelta: 25, experienceAfter: 125, levelAfter: 3 }),
  event(22, 12, "currency.changed", { currency: "gold", delta: -7, amountAfter: 42 }),
  event(23, 13, "dungeon.trap-triggered", { dungeonId: "dungeon:glass", cellId: "cell:2:0", damage: 5, healthBefore: 31, healthAfter: 26 }),
  event(24, 14, "command.applied", { commandType: "fulfill-quest" }),
  event(25, 14, "quest.fulfilled", { completionId: "quest:pilgrim:instance:0:fulfilled", questInstanceId: "quest:pilgrim:instance:0", questId: "quest:pilgrim", questOrdinal: 0, objectiveCount: 5, subquestCount: 2, totalCompletedQuests: 1 }),
  event(26, 15, "command.applied", { commandType: "apply-quest-reward" }),
  event(27, 15, "quest.reward-applied", { grantId: "quest:pilgrim:instance:0:fulfilled:reward:0", completionId: "quest:pilgrim:instance:0:fulfilled", experienceDelta: 25, experienceAfter: 125, levelBefore: 3, levelAfter: 4, goldDelta: 23, goldAfter: 65, itemId: "loot:quest:pilgrim:reward:0", itemDisposition: "converted-to-gold", itemConversionGold: 8 }),
  event(28, 16, "quest.reward-applied", { grantId: "quest:capped:instance:0:fulfilled:reward:0", completionId: "quest:capped:instance:0:fulfilled", experienceDelta: 25, experienceAfter: 150, levelBefore: 4, levelAfter: 4, goldDelta: 0, goldAfter: Number.MAX_SAFE_INTEGER, itemId: "loot:quest:capped:reward:0", itemDisposition: "converted-to-gold", itemConversionGold: 0 }),
  event(29, 17, "command.applied", { commandType: "admit-successor-quest" }),
  event(30, 17, "quest.admitted", { questInstanceId: "quest:bell:instance:1", questId: "quest:bell", questOrdinal: 1, predecessorCompletionId: "quest:pilgrim:instance:0:fulfilled", generatorVersion: "quest-sequence-v1", objectiveCount: 3, subquestCount: 1 }),
  event(31, 17, "quest.lead-revealed", { leadId: "quest:bell:instance:1:lead:quest:cross-maze", questInstanceId: "quest:bell:instance:1", questOrdinal: 1, objectiveId: "quest:cross-maze", locationId: "location:glass-vault", selectorVersion: "quest-lead-v1" }),
];

function appendChecksum(body: Uint8Array): Uint8Array {
  const output = new Uint8Array(body.byteLength + 4);
  output.set(body);
  const checksum = adventureChecksum(body);
  output[body.byteLength] = checksum & 0xff;
  output[body.byteLength + 1] = (checksum >>> 8) & 0xff;
  output[body.byteLength + 2] = (checksum >>> 16) & 0xff;
  output[body.byteLength + 3] = (checksum >>> 24) & 0xff;
  return output;
}

function bodyOf(segment: Uint8Array): Uint8Array {
  return segment.slice(0, -4);
}

function readVarint(values: Uint8Array, start: number): { value: number; next: number } {
  let offset = start;
  let value = 0;
  let multiplier = 1;
  while (offset < values.length) {
    const byte = values[offset];
    if (byte === undefined) throw new Error("Missing fixture byte");
    offset += 1;
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return { value, next: offset };
    multiplier *= 0x80;
  }
  throw new Error("Truncated fixture varint");
}

interface SegmentLayout {
  eventCountOffset: number;
  dictionaryCountOffset: number;
  dictionaryEntries: readonly { lengthOffset: number; dataOffset: number; byteLength: number }[];
  dictionaryEnd: number;
  dictionaryCount: number;
  recordLengthOffset: number;
  recordStart: number;
  recordEnd: number;
  schemaOffset: number;
  typeOffset: number;
  actorOffset: number;
  causeCountOffset: number;
}

function segmentLayout(body: Uint8Array): SegmentLayout {
  let offset = 4;
  offset = readVarint(body, offset).next;
  const eventCountOffset = offset;
  offset = readVarint(body, offset).next;
  const dictionaryCountOffset = offset;
  const dictionary = readVarint(body, offset);
  offset = dictionary.next;
  const dictionaryEntries: { lengthOffset: number; dataOffset: number; byteLength: number }[] = [];
  for (let index = 0; index < dictionary.value; index += 1) {
    const lengthOffset = offset;
    const length = readVarint(body, offset);
    offset = length.next;
    dictionaryEntries.push({ lengthOffset, dataOffset: offset, byteLength: length.value });
    offset += length.value;
  }
  const dictionaryEnd = offset;
  offset = readVarint(body, offset).next;
  const recordLengthOffset = offset;
  const recordLength = readVarint(body, offset);
  const recordStart = recordLength.next;
  let recordOffset = recordStart;
  const schemaOffset = recordOffset;
  recordOffset = readVarint(body, recordOffset).next;
  recordOffset = readVarint(body, recordOffset).next;
  recordOffset = readVarint(body, recordOffset).next;
  const typeOffset = recordOffset;
  recordOffset = readVarint(body, recordOffset).next;
  const actorOffset = recordOffset;
  recordOffset = readVarint(body, recordOffset).next;
  const causeCountOffset = recordOffset;
  return { eventCountOffset, dictionaryCountOffset, dictionaryEntries, dictionaryEnd, dictionaryCount: dictionary.value, recordLengthOffset, recordStart, recordEnd: recordStart + recordLength.value, schemaOffset, typeOffset, actorOffset, causeCountOffset };
}

function compactEvent(index: number): AdventureEvent {
  const sequence = index + 1;
  const tick = Math.floor(index / 3);
  const actor = "hero:aster";
  const common = { sequence, tick };
  switch (index % 26) {
    case 0: return event(sequence, tick, "campaign.started", { seed: index, rulesetVersion: "rules:v1", generatorVersion: "generator:v1", worldSchemaVersion: "world:v2", depthSchemaVersion: "depth:v1", initialStateHash: "sha256:genesis", heroId: actor, locationId: `location:${index % 32}` });
    case 1: return event(sequence, tick, "command.applied", { commandType: "combat-action" });
    case 2: return event(sequence, tick, "route.planned", { originLocationId: `location:${index % 32}`, destinationId: `location:${(index + 3) % 32}`, legs: 2, distance: 31, routeHash: `route:${index % 64}` });
    case 3: return event(sequence, tick, "travel.edge-advanced", { edgeId: `edge:${index % 48}`, progressBefore: 4, progressAfter: 11, reachedLocationId: null, routeCompleted: false });
    case 4: return event(sequence, tick, "town.visited", { townId: `town:${index % 16}`, visit: 1 + index % 50, reputationAfter: index % 100 });
    case 5: return event(sequence, tick, "dungeon.entered", { dungeonId: `dungeon:${index % 24}`, width: 7, height: 7, layoutVersion: "maze:v1", layoutHash: `layout:${index % 24}` });
    case 6: return event(sequence, tick, "dungeon.moved", { dungeonId: `dungeon:${index % 24}`, fromCellId: `cell:${index % 49}`, toCellId: `cell:${(index + 1) % 49}`, direction: "east", firstVisit: index % 2 === 0, feature: null, completed: false });
    case 7: return event(sequence, tick, "combat.started", { combatId: `combat:${index % 128}`, enemySpeciesIds: [`species:${index % 12}`, `species:${(index + 1) % 12}`] });
    case 8: return event(sequence, tick, "combat.action", { combatId: `combat:${index % 128}`, round: 1 + index % 20, turn: 1 + index % 200, action: "ability", targetId: `monster:${index % 16}`, abilityId: `ability:${index % 24}`, manaCost: 3 });
    case 9: return event(sequence, tick, "combat.effect", { combatId: `combat:${index % 128}`, kind: "damage", targetId: `monster:${index % 16}`, resource: "health", amount: 1 + index % 12, resourceAfter: index % 80, statusId: null, statusDurationAfter: null, statusPotencyAfter: null });
    case 10: return event(sequence, tick, "combat.ended", { combatId: `combat:${index % 128}`, outcome: "victory", turns: 1 + index % 64 });
    case 11: return event(sequence, tick, "monster.observed", { speciesId: `species:${index % 12}`, encountersAfter: 1 + index % 1000 });
    case 12: return event(sequence, tick, "monster.insight-gained", { speciesId: `species:${index % 12}`, insightDelta: 1, insightAfter: 1 + index % 1000, requiredInsight: 12, victoriesAfter: index % 100 });
    case 13: return event(sequence, tick, "ability.progressed", { abilityId: `ability:${index % 24}`, source: index % 2 === 0 ? "combat" : "training", experienceDelta: 3, experienceAfter: 3 + index % 10000, levelAfter: 1 + index % 50, usesDelta: 1, usesAfter: 1 + index % 10000 });
    case 14: return event(sequence, tick, "ability.learned", { abilityId: `ability:${index % 24}`, speciesId: `species:${index % 12}` });
    case 15: return event(sequence, tick, "quest.progressed", { objectiveId: `objective:${index % 24}`, appliedDelta: 1, currentAfter: 1 + index % 50, objectiveCompleted: index % 17 === 0 });
    case 16: return event(sequence, tick, "actor.recovered", { healthDelta: 1 + index % 9, healthAfter: 20 + index % 80, manaDelta: index % 5, manaAfter: 5 + index % 30 });
    case 17: return event(sequence, tick, "item.acquired", { itemId: `item:${index % 64}`, quantity: 1 });
    case 18: return event(sequence, tick, "equipment.changed", { slot: "weapon", previousItemId: null, itemId: `item:${index % 64}` });
    case 19: return event(sequence, tick, "hero.progressed", { experienceDelta: 10, experienceAfter: index * 10, levelAfter: 1 + index % 100 });
    case 20: return event(common.sequence, common.tick, "currency.changed", { currency: "gold", delta: index % 2 === 0 ? 3 : -2, amountAfter: 10 + index }, null);
    case 21: return event(sequence, tick, "dungeon.trap-triggered", { dungeonId: `dungeon:${index % 24}`, cellId: `cell:${index % 49}`, damage: 4, healthBefore: 31, healthAfter: 27 });
    case 22: return event(sequence, tick, "quest.fulfilled", { completionId: `quest:${index % 32}:instance:${index}:fulfilled`, questInstanceId: `quest:${index % 32}:instance:${index}`, questId: `quest:${index % 32}`, questOrdinal: index, objectiveCount: 5, subquestCount: 2, totalCompletedQuests: index + 1 });
    case 23: return event(sequence, tick, "quest.reward-applied", { grantId: `completion:${index}:reward:0`, completionId: `completion:${index}`, experienceDelta: 25, experienceAfter: 25 + index, levelBefore: 1 + index % 50, levelAfter: 1 + index % 50, goldDelta: 15, goldAfter: 15 + index, itemId: `item:${index % 64}`, itemDisposition: "inventory", itemConversionGold: 0 });
    case 24: return event(sequence, tick, "quest.admitted", { questInstanceId: `quest:${index % 32}:instance:${index}`, questId: `quest:${index % 32}`, questOrdinal: index, predecessorCompletionId: `quest:${(index + 31) % 32}:instance:${index - 1}:fulfilled`, generatorVersion: "quest-sequence-v1", objectiveCount: 3, subquestCount: 1 });
    default: return event(sequence, tick, "quest.lead-revealed", { leadId: `quest:${index % 32}:instance:${index}:lead:quest:cross-maze`, questInstanceId: `quest:${index % 32}:instance:${index}`, questOrdinal: index, objectiveId: "quest:cross-maze", locationId: `location:${index % 32}`, selectorVersion: "quest-lead-v1" });
  }
}

describe("compact adventure event codec", () => {
  it("round-trips every version-one semantic event shape canonically", () => {
    const encoded = encodeAdventureSegment(fixtures);
    expect(decodeAdventureSegment(encoded)).toEqual(fixtures);
    expect(encodeAdventureSegment(decodeAdventureSegment(encoded))).toEqual(encoded);
    expect(encodeAdventureSegment(JSON.parse(JSON.stringify(fixtures)))).toEqual(encoded);
  });

  it("freezes every append-only numeric registry", () => {
    expect(adventureCodecCodeManifest).toEqual({
      events: { "campaign.started": 1, "command.applied": 2, "route.planned": 3, "travel.edge-advanced": 4, "town.visited": 5, "dungeon.entered": 6, "dungeon.moved": 7, "combat.started": 8, "combat.action": 9, "combat.effect": 10, "combat.ended": 11, "monster.observed": 12, "monster.insight-gained": 13, "ability.progressed": 14, "ability.learned": 15, "quest.progressed": 16, "actor.recovered": 17, "item.acquired": 18, "equipment.changed": 19, "hero.progressed": 20, "currency.changed": 21, "dungeon.trap-triggered": 22, "quest.fulfilled": 23, "quest.reward-applied": 24, "quest.admitted": 25, "quest.lead-revealed": 26 },
      commands: { "plan-route": 1, travel: 2, "visit-town": 3, "enter-dungeon": 4, "move-dungeon": 5, "start-combat": 6, "combat-action": 7, "train-ability": 8, "progress-objective": 9, wait: 10, "disarm-dungeon-trap": 11, "start-counter-duel": 12, "counter-duel-action": 13, "unlock-dungeon-gate": 14, "fulfill-quest": 15, "apply-quest-reward": 16, "admit-successor-quest": 17 },
      directions: { north: 1, east: 2, south: 3, west: 4 },
      combatActions: { attack: 1, guard: 2, ability: 3 },
      combatOutcomes: { victory: 1, defeat: 2, stalemate: 3 },
      combatEffects: { damage: 1, healing: 2, "mana-spent": 3, guarded: 4, "status-applied": 5, "status-tick": 6, "status-expired": 7, defeated: 8 },
      resources: { health: 1, mana: 2, guard: 3 },
      abilityProgressSources: { combat: 1, training: 2 },
      currencies: { gold: 1 },
    });
    for (const registry of Object.values(adventureCodecCodeManifest)) {
      const values = Object.values(registry);
      expect(new Set(values).size).toBe(values.length);
      expect(values.every((value) => Number.isInteger(value) && value > 0)).toBe(true);
    }
  });

  it("preserves canonical UTF-8 strings and hard numeric boundaries", () => {
    const withBom = [{ ...fixtures[0], campaignId: "\ufeffcampaign:ledger" } as AdventureEvent];
    expect(decodeAdventureSegment(encodeAdventureSegment(withBom))).toEqual(withBom);
    expect(() => encodeAdventureSegment([{ ...fixtures[0], campaignId: "bad\ud800id" } as AdventureEvent])).toThrow("canonical UTF-8");
    const boundary = event(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, "currency.changed", { currency: "gold", delta: -Math.floor(Number.MAX_SAFE_INTEGER / 2), amountAfter: Number.MAX_SAFE_INTEGER }, null, [1]);
    expect(decodeAdventureSegment(encodeAdventureSegment([boundary]))).toEqual([boundary]);
    const maxString = [{ ...fixtures[0], campaignId: "x".repeat(maximumAdventureStringBytes) } as AdventureEvent];
    expect(decodeAdventureSegment(encodeAdventureSegment(maxString))).toEqual(maxString);
  });

  it("keeps a stable short binary fixture", () => {
    const encoded = encodeAdventureSegment(fixtures.slice(0, 2));
    const hex = Array.from(encoded, (value) => value.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe("544732450102080f63616d706169676e3a6c65646765720864657074683a76310c67656e657261746f723a76310a6865726f3a61737465720a6c6f636174696f6e3a300872756c65733a76310e7368613235363a67656e6573697308776f726c643a76320112010100010400ffffffff0f060308020704050801010102040101011fbb5f03");
  });

  it("round-trips 100,000 all-family events compactly and byte-identically", () => {
    const corpus = Array.from({ length: 100_000 }, (_, index) => compactEvent(index));
    const encoded = encodeAdventureSegment(corpus);
    const decoded = decodeAdventureSegment(encoded);
    const lengths = [...adventureEventRecordByteLengths(corpus)].sort((left, right) => left - right);
    expect(lengths[Math.floor(lengths.length * 0.5)]).toBeLessThanOrEqual(64);
    expect(lengths[Math.floor(lengths.length * 0.95)]).toBeLessThanOrEqual(256);
    expect(encoded.byteLength).toBeLessThanOrEqual(6_400_000);
    expect(decoded).toEqual(corpus);
    expect(encodeAdventureSegment(decoded)).toEqual(encoded);
  }, 150_000);

  it("rejects exact-schema, actor, causal, ordering, and semantic violations", () => {
    const leadReveal = fixtures[30] as Extract<AdventureEvent, { type: "quest.lead-revealed" }>;
    expect(() => assertAdventureEvent({ ...fixtures[0], extra: true })).toThrow("fields");
    expect(() => encodeAdventureSegment([{ ...fixtures[1], actorId: null } as AdventureEvent])).toThrow("requires an actor");
    expect(() => encodeAdventureSegment([{ ...fixtures[1], causeSequences: [2] } as AdventureEvent])).toThrow("precede");
    expect(() => encodeAdventureSegment([{ ...fixtures[2], causeSequences: [1, 1] } as AdventureEvent])).toThrow("strictly increasing");
    expect(() => encodeAdventureSegment([{ ...fixtures[2], causeSequences: Array.from({ length: maximumAdventureReferencesPerEvent + 1 }, (_, index) => index + 1) } as AdventureEvent])).toThrow("reference limit");
    expect(() => encodeAdventureSegment([fixtures[1] as AdventureEvent, fixtures[0] as AdventureEvent])).toThrow("sequences");
    expect(() => encodeAdventureSegment([{ ...fixtures[8], payload: { ...fixtures[8]?.payload, action: "guard" } } as AdventureEvent])).toThrow("guard");
    expect(() => encodeAdventureSegment([{ ...fixtures[9], payload: { ...fixtures[9]?.payload, statusId: "status:bad" } } as AdventureEvent])).toThrow("status fields");
    expect(() => encodeAdventureSegment([{ ...fixtures[22], payload: { ...fixtures[22]?.payload, damage: 4 } } as AdventureEvent])).toThrow("exact health decrease");
    expect(() => encodeAdventureSegment([{ ...fixtures[24], payload: { ...fixtures[24]?.payload, totalCompletedQuests: 2 } } as AdventureEvent])).toThrow("follow its ordinal");
    expect(() => encodeAdventureSegment([{ ...fixtures[26], payload: { ...fixtures[26]?.payload, grantId: "unrelated:reward:0" } } as AdventureEvent])).toThrow("grant identity");
    expect(() => encodeAdventureSegment([{ ...fixtures[26], payload: { ...fixtures[26]?.payload, itemDisposition: "inventory" } } as AdventureEvent])).toThrow("cannot credit conversion gold");
    expect(() => encodeAdventureSegment([{ ...fixtures[29], payload: { ...fixtures[29]?.payload, predecessorCompletionId: "quest:wrong:instance:7:fulfilled" } } as AdventureEvent])).toThrow("predecessor identity");
    expect(() => encodeAdventureSegment([{ ...fixtures[29], payload: { ...fixtures[29]?.payload, generatorVersion: "quest-sequence-v2" } } as AdventureEvent])).toThrow("generator version");
    expect(() => encodeAdventureSegment([{ ...leadReveal, payload: { ...leadReveal.payload, leadId: "lead:forged" } } as AdventureEvent])).toThrow("lead identity");
    expect(() => encodeAdventureSegment([{ ...leadReveal, payload: { ...leadReveal.payload, selectorVersion: "quest-lead-v2" } } as unknown as AdventureEvent])).toThrow("selector version");
    expect(() => encodeAdventureSegment([{ ...leadReveal, payload: { ...leadReveal.payload, objectiveId: "quest:win-battle" } } as AdventureEvent])).toThrow("lead objective");
  });

  it("rejects prototype names for every enum family", () => {
    for (const inheritedName of ["toString", "constructor", "__proto__"]) {
      expect(() => assertAdventureEvent({ ...fixtures[0], type: inheritedName })).toThrow("event type");
      expect(() => assertAdventureEvent({ ...fixtures[1], payload: { commandType: inheritedName } })).toThrow("commandType");
      expect(() => assertAdventureEvent({ ...fixtures[6], payload: { ...fixtures[6]?.payload, direction: inheritedName } })).toThrow("direction");
      expect(() => assertAdventureEvent({ ...fixtures[8], payload: { ...fixtures[8]?.payload, action: inheritedName } })).toThrow("combat action");
      expect(() => assertAdventureEvent({ ...fixtures[9], payload: { ...fixtures[9]?.payload, kind: inheritedName } })).toThrow("combat effect");
      expect(() => assertAdventureEvent({ ...fixtures[9], payload: { ...fixtures[9]?.payload, resource: inheritedName } })).toThrow("resource");
      expect(() => assertAdventureEvent({ ...fixtures[11], payload: { ...fixtures[11]?.payload, outcome: inheritedName } })).toThrow("outcome");
      expect(() => assertAdventureEvent({ ...fixtures[14], payload: { ...fixtures[14]?.payload, source: inheritedName } })).toThrow("source");
      expect(() => assertAdventureEvent({ ...fixtures[21], payload: { ...fixtures[21]?.payload, currency: inheritedName } })).toThrow("currency");
    }
  });

  it("rejects checksum damage and truncation without partial output", () => {
    const encoded = encodeAdventureSegment(fixtures);
    const damaged = encoded.slice();
    damaged[Math.floor(damaged.length / 2)]! ^= 0x01;
    expect(() => decodeAdventureSegment(damaged)).toThrow("checksum");
    expect(() => decodeAdventureSegment(encoded.slice(0, -1))).toThrow();
  });

  it("rejects unknown codec, record, and event versions plus noncanonical varints", () => {
    const base = encodeAdventureSegment([fixtures[0]!]);
    const unknownCodec = bodyOf(base);
    unknownCodec[4] = 2;
    expect(() => decodeAdventureSegment(appendChecksum(unknownCodec))).toThrow("codec version");

    const unknownRecord = bodyOf(base);
    unknownRecord[segmentLayout(unknownRecord).schemaOffset] = 2;
    expect(() => decodeAdventureSegment(appendChecksum(unknownRecord))).toThrow("schema version");

    const unknownType = bodyOf(base);
    unknownType[segmentLayout(unknownType).typeOffset] = 99;
    expect(() => decodeAdventureSegment(appendChecksum(unknownType))).toThrow("event type");

    const expanded = [...bodyOf(base)];
    expanded.splice(4, 1, 0x81, 0x00);
    expect(() => decodeAdventureSegment(appendChecksum(Uint8Array.from(expanded)))).toThrow("canonical");
  });

  it("rejects oversized decoded counts and UTF-8 lengths before allocation", () => {
    const base = bodyOf(encodeAdventureSegment([fixtures[0]!]));
    const eventOverflow = [...base];
    const layout = segmentLayout(base);
    eventOverflow.splice(layout.eventCountOffset, 1, 0xa1, 0x8d, 0x06);
    expect(() => decodeAdventureSegment(appendChecksum(Uint8Array.from(eventOverflow)))).toThrow("event count");

    const dictionaryOverflow = [...base];
    dictionaryOverflow.splice(layout.dictionaryCountOffset, 1, 0x80, 0x80, 0x04);
    expect(() => decodeAdventureSegment(appendChecksum(Uint8Array.from(dictionaryOverflow)))).toThrow("dictionary count");

    const oversizedString = [...base];
    const first = layout.dictionaryEntries[0]!;
    oversizedString.splice(first.lengthOffset, 1, 0x81, 0x02);
    expect(() => decodeAdventureSegment(appendChecksum(Uint8Array.from(oversizedString)))).toThrow("string length");
  });

  it("rejects duplicate, reordered, unused, malformed, and broken dictionary entries", () => {
    const base = encodeAdventureSegment([{ ...event(1, 0, "actor.recovered", { healthDelta: 3, healthAfter: 30, manaDelta: 1, manaAfter: 10 }, "bbbbb"), campaignId: "aaaaa" }]);

    const duplicate = bodyOf(base);
    const duplicateLayout = segmentLayout(duplicate);
    const first = duplicateLayout.dictionaryEntries[0]!;
    const second = duplicateLayout.dictionaryEntries[1]!;
    duplicate.set(duplicate.subarray(first.dataOffset, first.dataOffset + first.byteLength), second.dataOffset);
    expect(() => decodeAdventureSegment(appendChecksum(duplicate))).toThrow("duplicates");

    const reordered = bodyOf(base);
    const left = reordered.slice(first.dataOffset, first.dataOffset + first.byteLength);
    const right = reordered.slice(second.dataOffset, second.dataOffset + second.byteLength);
    reordered.set(right, first.dataOffset);
    reordered.set(left, second.dataOffset);
    expect(() => decodeAdventureSegment(appendChecksum(reordered))).toThrow("order");

    const unused = [...bodyOf(base)];
    const unusedLayout = segmentLayout(Uint8Array.from(unused));
    unused[unusedLayout.dictionaryCountOffset] = unusedLayout.dictionaryCount + 1;
    unused.splice(unusedLayout.dictionaryEnd, 0, 5, ...new TextEncoder().encode("ccccc"));
    expect(() => decodeAdventureSegment(appendChecksum(Uint8Array.from(unused)))).toThrow("unused");

    const broken = bodyOf(base);
    const brokenLayout = segmentLayout(broken);
    broken[brokenLayout.actorOffset] = brokenLayout.dictionaryCount + 1;
    expect(() => decodeAdventureSegment(appendChecksum(broken))).toThrow("broken");

    const malformedUtf8 = bodyOf(base);
    const utf8 = segmentLayout(malformedUtf8).dictionaryEntries[0]!;
    malformedUtf8[utf8.dataOffset] = 0xff;
    expect(() => decodeAdventureSegment(appendChecksum(malformedUtf8))).toThrow("UTF-8");
  });

  it("rejects future and broken causal deltas plus unknown trailing fields", () => {
    const causal = bodyOf(encodeAdventureSegment(fixtures.slice(1, 2)));
    const causalLayout = segmentLayout(causal);
    const causeCount = readVarint(causal, causalLayout.causeCountOffset);
    causal[causeCount.next] = fixtures[1]!.sequence;
    expect(() => decodeAdventureSegment(appendChecksum(causal))).toThrow("precede");

    const trailing = [...bodyOf(encodeAdventureSegment([fixtures[0]!]))];
    const trailingLayout = segmentLayout(Uint8Array.from(trailing));
    trailing[trailingLayout.recordLengthOffset] = trailingLayout.recordEnd - trailingLayout.recordStart + 1;
    trailing.splice(trailingLayout.recordEnd, 0, 0);
    expect(() => decodeAdventureSegment(appendChecksum(Uint8Array.from(trailing)))).toThrow("trailing fields");
  });

  it("fails fast when realistic unique identifiers exhaust a segment dictionary", () => {
    const count = maximumAdventureDictionaryEntries;
    const highCardinality = Array.from({ length: count }, (_, index) => event(index + 1, index, "item.acquired", { itemId: `unique-item:${index}`, quantity: 1 }));
    expect(() => encodeAdventureSegment(highCardinality)).toThrow("dictionary count");
  }, 30_000);
});
