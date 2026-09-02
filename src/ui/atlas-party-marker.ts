import type { DepthState } from "../depth/types";
import { isValidActiveCompanion, isValidCompanionRoster } from "../depth/companion";
import { projectRoute } from "../render/route-projection";
import { activePartyCompanionStatus, type PartyCompanionStatus } from "./party-projection";

export type AtlasPartyMarkerLocus =
  | { readonly kind: "location"; readonly locationId: string }
  | {
      readonly kind: "route";
      readonly edgeId: string;
      readonly fromId: string;
      readonly toId: string;
      readonly legRatio: number;
    };

export interface AtlasPartyMarkerPosition {
  readonly terrainX: number;
  readonly terrainY: number;
  readonly locus: AtlasPartyMarkerLocus;
}

export interface AtlasPartyMarkerCompanion {
  readonly id: string;
  readonly name: string;
  readonly status: PartyCompanionStatus;
}

export type AtlasPartyMarkerFormation =
  | { readonly kind: "solo"; readonly companion: null }
  | {
      readonly kind: "paired";
      readonly companion: AtlasPartyMarkerCompanion & { readonly status: "travelling" | "arrived" };
    }
  | {
      readonly kind: "paired-injured";
      readonly companion: AtlasPartyMarkerCompanion & { readonly status: "injured" | "arrived-injured" };
    };

export interface AtlasPartyMarkerV1 {
  readonly projectionVersion: "atlas-party-marker-v1";
  readonly position: AtlasPartyMarkerPosition;
  readonly hero: { readonly id: string; readonly name: string };
  readonly formation: AtlasPartyMarkerFormation;
  readonly accessibleText: string;
}

export interface AtlasPartyGlyph {
  readonly kind: "hero" | "companion";
  readonly pose: "upright" | "supported";
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface AtlasPartySupportLink {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
}

export type AtlasPartyMarkerSource = Pick<DepthState, "atlas" | "hero" | "companions">;

function boundedIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function freezeMarker(marker: AtlasPartyMarkerV1): AtlasPartyMarkerV1 {
  Object.freeze(marker.position.locus);
  Object.freeze(marker.position);
  Object.freeze(marker.hero);
  if (marker.formation.companion !== null) Object.freeze(marker.formation.companion);
  Object.freeze(marker.formation);
  return Object.freeze(marker);
}

export function projectAtlasPartyMarker(source: AtlasPartyMarkerSource): AtlasPartyMarkerV1 | null {
  const { atlas, companions, hero } = source;
  if (!boundedIdentity(hero.id) || !boundedIdentity(hero.name) || !isValidCompanionRoster(companions)) return null;
  if (companions.active.length > 1) return null;

  const route = projectRoute(atlas);
  let position: AtlasPartyMarkerPosition;
  if (atlas.route === null) {
    const currentMatches = atlas.locations.filter((location) => location.id === atlas.currentLocationId);
    const current = currentMatches.length === 1 ? currentMatches[0] : undefined;
    if (current === undefined) return null;
    position = {
      terrainX: current.x,
      terrainY: current.y,
      locus: { kind: "location", locationId: current.id },
    };
  } else {
    if (route === null) return null;
    position = {
      terrainX: route.terrainX,
      terrainY: route.terrainY,
      locus: {
        kind: "route",
        edgeId: route.edgeId,
        fromId: route.fromId,
        toId: route.toId,
        legRatio: route.legRatio,
      },
    };
  }

  const active = companions.active[0];
  if (active === undefined) {
    return freezeMarker({
      projectionVersion: "atlas-party-marker-v1",
      position,
      hero: { id: hero.id, name: hero.name },
      formation: { kind: "solo", companion: null },
      accessibleText: `Party of one: ${hero.name}.`,
    });
  }
  if (!isValidActiveCompanion(active)) return null;
  const destinationMatches = atlas.locations.filter((location) => location.id === active.destination.locationId);
  if (destinationMatches.length !== 1 || destinationMatches[0]?.name !== active.destination.name) return null;
  if (active.phase === "arrived") {
    if (atlas.route !== null || atlas.currentLocationId !== active.destination.locationId) return null;
  } else {
    if (atlas.route === null && atlas.currentLocationId === active.destination.locationId) return null;
    if (atlas.route !== null && atlas.route.destinationId !== active.destination.locationId) return null;
  }

  const status = activePartyCompanionStatus(active);
  const injured = status === "injured" || status === "arrived-injured";
  return freezeMarker({
    projectionVersion: "atlas-party-marker-v1",
    position,
    hero: { id: hero.id, name: hero.name },
    formation: injured
      ? {
          kind: "paired-injured",
          companion: { id: active.identity.residentId, name: active.identity.name, status },
        }
      : {
          kind: "paired",
          companion: { id: active.identity.residentId, name: active.identity.name, status },
        },
    accessibleText: `Party of two with ${active.identity.name}, ${status}.`,
  });
}

export function projectAtlasPartyGlyphs(marker: AtlasPartyMarkerV1): readonly AtlasPartyGlyph[] {
  if (marker.formation.kind === "solo") {
    return Object.freeze([Object.freeze({ kind: "hero", pose: "upright", offsetX: 0, offsetY: 0 })]);
  }
  const supported = marker.formation.kind === "paired-injured";
  return Object.freeze([
    Object.freeze({ kind: "hero", pose: "upright", offsetX: -2.8, offsetY: 0 }),
    Object.freeze({ kind: "companion", pose: supported ? "supported" : "upright", offsetX: 2.8, offsetY: supported ? 1.2 : 0 }),
  ]);
}

export function projectAtlasPartySupportLink(marker: AtlasPartyMarkerV1): AtlasPartySupportLink | null {
  return marker.formation.kind === "paired-injured"
    ? Object.freeze({ fromX: -1.3, fromY: 0.7, toX: 1.8, toY: 1.1 })
    : null;
}
