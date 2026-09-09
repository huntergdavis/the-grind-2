import type { TownBuilding } from "../depth/types";
import { isTownItineraryPacketV1 } from "./town-itinerary";

export interface ChroniclePlateLandmarkV1 {
  readonly id: string;
  readonly name: string;
  readonly kind: TownBuilding["kind"];
  readonly districtId: string;
}

/** An illustrated landmark reconstruction, not a photograph or a canonical save. */
export interface ChroniclePlateRecipeV1 {
  readonly schemaVersion: 1;
  readonly kind: "town-visit";
  readonly templateId: "town-landmarks@1";
  readonly sourceEventId: string;
  readonly campaignId: string;
  readonly sourceTick: number;
  readonly town: Readonly<{ id: string; locationId: string; name: string; specialty: string }>;
  readonly visit: Readonly<{ before: number; after: number }>;
  readonly reputation: Readonly<{ before: number; after: number }>;
  readonly landmarks: readonly ChroniclePlateLandmarkV1[];
}

const recipeKeys = ["schemaVersion", "kind", "templateId", "sourceEventId", "campaignId", "sourceTick", "town", "visit", "reputation", "landmarks"];
const buildingKinds: readonly TownBuilding["kind"][] = ["inn", "smithy", "market", "shrine", "hall", "home"];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function text(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum && value.trim().length > 0
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

function counter(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is { before: number; after: number } {
  return record(value) && exactKeys(value, ["before", "after"])
    && integer(value.before, maximum) && integer(value.after, maximum);
}

function landmark(value: unknown): value is ChroniclePlateLandmarkV1 {
  return record(value) && exactKeys(value, ["id", "name", "kind", "districtId"])
    && text(value.id, 512) && text(value.name, 160) && text(value.districtId, 512)
    && buildingKinds.includes(value.kind as TownBuilding["kind"]);
}

/** Validate and copy every retained field; later town or caller mutations cannot repaint an old plate. */
export function captureChroniclePlateRecipe(value: unknown): ChroniclePlateRecipeV1 | null {
  try {
    if (!record(value) || !exactKeys(value, recipeKeys)
      || value.schemaVersion !== 1 || value.kind !== "town-visit" || value.templateId !== "town-landmarks@1"
      || !text(value.sourceEventId, 512) || !text(value.campaignId, 512) || !integer(value.sourceTick)
      || value.sourceEventId !== `${value.campaignId}:${value.sourceTick}`
      || !record(value.town) || !exactKeys(value.town, ["id", "locationId", "name", "specialty"])
      || !text(value.town.id, 512) || !text(value.town.locationId, 512)
      || value.town.id !== `town:${value.town.locationId}`
      || !text(value.town.name, 160) || !text(value.town.specialty, 160)
      || !counter(value.visit) || value.visit.after !== value.visit.before + 1
      || !counter(value.reputation, 100) || value.reputation.after !== Math.min(100, value.reputation.before + 1)
      || !Array.isArray(value.landmarks) || value.landmarks.length < 1 || value.landmarks.length > 3
      || !value.landmarks.every(landmark)) return null;
    const landmarks = value.landmarks;
    if (new Set(landmarks.map((entry) => entry.id)).size !== landmarks.length
      || landmarks.some((entry) => entry.districtId !== landmarks[0]!.districtId)) return null;
    return Object.freeze({
      schemaVersion: 1, kind: "town-visit", templateId: "town-landmarks@1",
      sourceEventId: value.sourceEventId, campaignId: value.campaignId, sourceTick: value.sourceTick,
      town: Object.freeze({ id: value.town.id, locationId: value.town.locationId, name: value.town.name, specialty: value.town.specialty }),
      visit: Object.freeze({ before: value.visit.before, after: value.visit.after }),
      reputation: Object.freeze({ before: value.reputation.before, after: value.reputation.after }),
      landmarks: Object.freeze(landmarks.map((entry) => Object.freeze({ id: entry.id, name: entry.name, kind: entry.kind, districtId: entry.districtId }))),
    });
  } catch {
    return null;
  }
}

/** The host calls this only after saving the packet's validated world transition. */
export function projectTownChroniclePlate(
  packet: unknown,
  context: { readonly campaignId: string; readonly currentTick: number },
): ChroniclePlateRecipeV1 | null {
  try {
    if (!isTownItineraryPacketV1(packet) || !text(context.campaignId, 512) || !integer(context.currentTick)
      || packet.campaignId !== context.campaignId || packet.tick > context.currentTick) return null;
    return captureChroniclePlateRecipe({
      schemaVersion: 1, kind: "town-visit", templateId: "town-landmarks@1",
      sourceEventId: packet.eventId, campaignId: packet.campaignId, sourceTick: packet.tick,
      town: { id: packet.town.id, locationId: packet.town.locationId, name: packet.town.name, specialty: packet.town.specialty },
      visit: packet.visit, reputation: packet.reputation,
      landmarks: packet.routeStops,
    });
  } catch {
    return null;
  }
}
