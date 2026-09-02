import type {
  CompanionCombatKit,
  CompanionActionId,
  CompanionActionRuntime,
} from "./types";

export const companionKitRulesVersion = "explicit-companion-kit-v1" as const;
export const basicCompanionKit: CompanionCombatKit = Object.freeze({
  schemaVersion: 1,
  kitId: "basic",
  rulesVersion: "basic-attack-guard-v1",
});
export const millerRoadcraftKit: CompanionCombatKit = Object.freeze({
  schemaVersion: 1,
  kitId: "miller-roadcraft",
  rulesVersion: "miller-roadcraft-v1",
});

export const millerRoadcraftActions = Object.freeze({
  "flour-veil": Object.freeze({
    id: "flour-veil" as const,
    name: "Flour Veil",
    effect: "guarding" as const,
    potency: 50,
    duration: 1,
    cooldownRounds: 1,
    manaCost: 0,
    itemCost: 0,
    damage: 0,
  }),
  "millstone-drag": Object.freeze({
    id: "millstone-drag" as const,
    name: "Millstone Drag",
    effect: "weakened" as const,
    potency: 2,
    duration: 2,
    cooldownRounds: 1,
    manaCost: 0,
    itemCost: 0,
    damage: 0,
  }),
});

export function isCompanionActionId(value: unknown): value is CompanionActionId {
  return value === "flour-veil" || value === "millstone-drag";
}
export function companionActionDefinition(actionId: CompanionActionId) {
  return millerRoadcraftActions[actionId];
}

export type CompanionActionVerbId =
  | "companion-action:miller-roadcraft-v1:flour-veil"
  | "companion-action:miller-roadcraft-v1:millstone-drag";

export function companionActionVerbId(actionId: CompanionActionId): CompanionActionVerbId {
  return `companion-action:miller-roadcraft-v1:${actionId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isValidCompanionCombatKit(value: unknown): value is CompanionCombatKit {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "kitId", "rulesVersion"]) || value.schemaVersion !== 1) return false;
  return value.kitId === "basic"
    ? value.rulesVersion === "basic-attack-guard-v1"
    : value.kitId === "miller-roadcraft" && value.rulesVersion === "miller-roadcraft-v1";
}

export function createCompanionActionRuntime(actorId: string, kit: CompanionCombatKit | undefined): CompanionActionRuntime | undefined {
  if (kit?.kitId !== "miller-roadcraft") return undefined;
  return {
    schemaVersion: 1,
    actorId,
    kitId: "miller-roadcraft",
    rulesVersion: "miller-roadcraft-v1",
    readyRounds: { "flour-veil": 1, "millstone-drag": 1 },
  };
}

export function isValidCompanionActionRuntime(value: unknown): value is CompanionActionRuntime {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "actorId", "kitId", "rulesVersion", "readyRounds"]) || !isRecord(value.readyRounds)) return false;
  return value.schemaVersion === 1 &&
    typeof value.actorId === "string" && value.actorId.length > 0 &&
    value.kitId === "miller-roadcraft" && value.rulesVersion === "miller-roadcraft-v1" &&
    hasExactKeys(value.readyRounds, ["flour-veil", "millstone-drag"]) &&
    Number.isSafeInteger(value.readyRounds["flour-veil"]) && (value.readyRounds["flour-veil"] as number) >= 1 &&
    Number.isSafeInteger(value.readyRounds["millstone-drag"]) && (value.readyRounds["millstone-drag"] as number) >= 1;
}
